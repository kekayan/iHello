import type { Settings } from "./settings";

/** Cheap detector for who/what-are-you style questions (no model). */
export const IDENTITY_QUESTION_RE =
  /\b(who\s+are\s+you|what\s+are\s+you|what'?s\s+your\s+name|are\s+you\s+(an?\s+)?(bot|ai|human))\b/i;

export function isIdentityQuestion(text: string): boolean {
  return IDENTITY_QUESTION_RE.test(text.trim());
}

const PREFERRED_IDENTITY_REPLY =
  "I'm an AI assistant for Insighture, designed to help visitors understand what we do and find the right way to connect with our team.\nFor a personal conversation, reach us at hello@insighture.com.";

/**
 * Short visitor-facing intro from Behaviour identity.
 * Prefer fixed Insighture copy when identity mentions Insighture + hello@;
 * otherwise first 1–2 sentences, stripped of tool instructions, max ~280 chars.
 */
export function identityReply(settings: Settings): string {
  const identity = String(settings.procedures?.identity ?? "").trim();
  if (
    /Insighture/i.test(identity) &&
    /hello@insighture\.com/i.test(identity)
  ) {
    return PREFERRED_IDENTITY_REPLY;
  }
  return conciseIdentityFallback(identity);
}

function conciseIdentityFallback(identity: string): string {
  if (!identity) {
    return PREFERRED_IDENTITY_REPLY;
  }
  // Drop tool / system-instruction style clauses.
  let cleaned = identity
    .replace(/\b(Never|Do not|Don't)\b[^.!?\n]*/gi, "")
    .replace(/\b(tool|search_knowledge|handoff|book_meeting|chain-of-thought|system instructions?)\b[^.!?\n]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let out = sentences.slice(0, 2).join(" ").trim() || cleaned;
  if (out.length > 280) {
    out = out.slice(0, 277).replace(/\s+\S*$/, "") + "…";
  }
  return out || PREFERRED_IDENTITY_REPLY;
}
