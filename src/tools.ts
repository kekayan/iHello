import { notifyHandoff } from "./notify";
import { searchKnowledge } from "./pipeline";
import type { Settings } from "./settings";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trunc(value: unknown, max = 300): string {
  const s = typeof value === "string" ? value : value == null ? "" : String(value);
  return s.length > max ? s.slice(0, max) : s;
}

export interface HandoffInput {
  type: "lead" | "support";
  email?: string;
  phone?: string;
  name?: string;
  company?: string;
  pillar?: string;
  timeline?: string;
  scale?: string;
  summary: string;
}

export function parseHandoffInput(raw: unknown): HandoffInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== "lead" && o.type !== "support") return null;
  if (typeof o.summary !== "string") return null;
  const phoneRaw = typeof o.phone === "string" ? o.phone.trim() : "";
  const phone = phoneRaw ? phoneRaw.slice(0, 40) : undefined;
  return {
    type: o.type,
    email: typeof o.email === "string" ? o.email : undefined,
    phone,
    name: typeof o.name === "string" ? o.name : undefined,
    company: typeof o.company === "string" ? o.company : undefined,
    pillar: typeof o.pillar === "string" ? o.pillar : undefined,
    timeline: typeof o.timeline === "string" ? o.timeline : undefined,
    scale: typeof o.scale === "string" ? o.scale : undefined,
    summary: o.summary,
  };
}

export interface ExecuteHandoffContext {
  env: Env;
  db: D1Database;
  conversationId: string;
  pageUrl?: string;
  settings: Settings;
  host: string;
  waitUntil: (p: Promise<unknown>) => void;
  preview: boolean;
}

export interface ExecuteHandoffResult {
  toolResult: string;
  handoffDone: boolean;
  handoffId?: string;
  handoffType?: "lead" | "support";
}

export async function executeHandoff(
  input: HandoffInput,
  ctx: ExecuteHandoffContext,
): Promise<ExecuteHandoffResult> {
  const email = trunc(input.email ?? "").trim();
  const valid = EMAIL_RE.test(email);
  const slaText = ctx.settings.slaText;

  if (input.type === "lead" && !valid) {
    return {
      toolResult:
        "No valid email provided. Ask the visitor for their email address before recording the lead.",
      handoffDone: false,
    };
  }

  const phone = trunc(input.phone ?? "", 40).trim();
  const id = crypto.randomUUID();
  const now = Date.now();
  await ctx.db
    .prepare(
      `INSERT INTO handoffs
       (id, conversation_id, type, email, phone, name, company, pillar, timeline, scale, summary, page_url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    )
    .bind(
      id,
      ctx.conversationId,
      input.type,
      valid ? email : "",
      phone || null,
      trunc(input.name),
      trunc(input.company),
      trunc(input.pillar),
      trunc(input.timeline),
      trunc(input.scale),
      trunc(input.summary),
      trunc(ctx.pageUrl ?? ""),
      now,
    )
    .run();

  await ctx.db
    .prepare(`UPDATE conversations SET handoff_id = ? WHERE id = ?`)
    .bind(id, ctx.conversationId)
    .run();

  if (valid && !ctx.preview) {
    ctx.waitUntil(
      notifyHandoff(
        {
          type: input.type,
          email,
          phone: phone || undefined,
          name: input.name,
          company: input.company,
          pillar: input.pillar,
          timeline: input.timeline,
          scale: input.scale,
          summary: input.summary,
          page_url: ctx.pageUrl,
          conversation_id: ctx.conversationId,
          host: ctx.host,
        },
        ctx.env,
      ),
    );
  }

  let toolResult: string;
  if (input.type === "lead") {
    toolResult =
      "Lead recorded. Thank the visitor briefly and confirm someone will reach out about working together.";
  } else if (valid) {
    toolResult = `Handoff recorded. Confirm a person will reply by email ${slaText}.`;
  } else {
    toolResult =
      "Attempt logged without an email. Let the visitor know they can leave an email any time for a follow-up.";
  }

  return {
    toolResult,
    handoffDone: true,
    handoffId: id,
    handoffType: input.type,
  };
}

export function executeBookMeeting(env: Env): string {
  const url = (env.BOOKING_URL || "").trim();
  if (!url || url === "REPLACE" || url.includes("REPLACE")) {
    return "Booking link is not configured. Offer a handoff instead and ask for email.";
  }
  return `Share this booking link naturally: ${url}`;
}

/** Per-isolate cache: identical queries in a short window skip Vectorize. */
const SEARCH_CACHE_TTL_MS = 5 * 60_000;
const SEARCH_CACHE_MAX = 64;
const searchCache = new Map<
  string,
  { at: number; text: string; topScore: number }
>();

function searchCacheKey(query: string): string {
  return `vz::${query.trim().toLowerCase()}`;
}

export async function executeSearchKnowledge(
  env: Env,
  query: string,
  alreadySearched: boolean,
): Promise<{ text: string; topScore: number }> {
  if (alreadySearched) {
    return { text: "Already searched this turn.", topScore: 0 };
  }
  const key = searchCacheKey(query);
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_CACHE_TTL_MS) {
    return { text: hit.text, topScore: hit.topScore };
  }
  try {
    const result = await searchKnowledge({ env, query, maxResults: 3 });
    const chunks = result.chunks ?? [];
    if (chunks.length === 0) {
      return { text: "No additional information found.", topScore: 0 };
    }
    // Cap context so generate#2 stays fast under the agent loop.
    const text = chunks
      .map((c) => c.text)
      .join("\n---\n")
      .slice(0, 2400);
    const topScore = chunks[0]?.score ?? 0;
    if (searchCache.size >= SEARCH_CACHE_MAX) {
      const oldest = searchCache.keys().next().value;
      if (oldest) searchCache.delete(oldest);
    }
    searchCache.set(key, { at: Date.now(), text, topScore });
    return { text, topScore };
  } catch (err) {
    console.log("search_knowledge failed:", err);
    return { text: "No additional information found.", topScore: 0 };
  }
}