import { notifyHandoff } from "./notify";
import type { Settings } from "./settings";

export const HANDOFF = {
  name: "handoff",
  description:
    'Record a handoff to a human. type "lead" for buying intent (valid email required). type "support" when you cannot resolve an issue or the visitor asks for a person — include the email if given, otherwise call with what you have so the attempt is logged. At most once per conversation.',
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["lead", "support"] },
      email: { type: "string" },
      name: { type: "string" },
      company: { type: "string" },
      pillar: { type: "string" },
      timeline: { type: "string" },
      scale: { type: "string" },
      summary: { type: "string" },
    },
    required: ["type", "summary"],
  },
} as const;

export const BOOK_MEETING = {
  name: "book_meeting",
  description:
    "When the visitor wants to talk or book a call, use this to get the booking link to share.",
  input_schema: {
    type: "object",
    properties: {},
    required: [] as string[],
  },
} as const;

export const SEARCH_KNOWLEDGE = {
  name: "search_knowledge",
  description:
    "Search the site knowledge base again with a different query when the provided context does not cover the visitor's question.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trunc(value: unknown, max = 300): string {
  const s = typeof value === "string" ? value : value == null ? "" : String(value);
  return s.length > max ? s.slice(0, max) : s;
}

export interface HandoffInput {
  type: "lead" | "support";
  email?: string;
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
  return {
    type: o.type,
    email: typeof o.email === "string" ? o.email : undefined,
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

  const id = crypto.randomUUID();
  const now = Date.now();
  await ctx.db
    .prepare(
      `INSERT INTO handoffs
       (id, conversation_id, type, email, name, company, pillar, timeline, scale, summary, page_url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    )
    .bind(
      id,
      ctx.conversationId,
      input.type,
      valid ? email : "",
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
  return `Share this booking link naturally: ${env.BOOKING_URL}`;
}

export async function executeSearchKnowledge(
  env: Env,
  query: string,
  alreadySearched: boolean,
): Promise<{ text: string; topScore: number }> {
  if (alreadySearched) {
    return { text: "Already searched this turn.", topScore: 0 };
  }
  try {
    const result = await env.AI_SEARCH.search({
      query,
      ai_search_options: {
        retrieval: { max_num_results: 4 },
        query_rewrite: { enabled: false },
      },
    });
    const chunks = result.chunks ?? [];
    if (chunks.length === 0) {
      return { text: "No additional information found.", topScore: 0 };
    }
    const text = chunks
      .map((c) => c.text)
      .join("\n---\n")
      .slice(0, 4000);
    const topScore = chunks[0]?.score ?? 0;
    return { text, topScore };
  } catch (err) {
    console.log("search_knowledge failed:", err);
    return { text: "No additional information found.", topScore: 0 };
  }
}

export function toolsForTurn(opts: {
  handoffDone: boolean;
  closing: boolean;
  customTools?: unknown[];
}): unknown[] {
  if (opts.closing) return [];
  const tools: unknown[] = [BOOK_MEETING, SEARCH_KNOWLEDGE];
  if (!opts.handoffDone) tools.unshift(HANDOFF);
  if (opts.customTools?.length) tools.push(...opts.customTools);
  return tools;
}
