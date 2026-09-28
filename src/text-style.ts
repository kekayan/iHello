/** Reply polishing and a one-line writing constraint for the system prompt. */

export const WRITING_STYLE_RULES =
  "Style: no em/en dashes; no filler openers; short natural sentences; light markdown OK.";

/** Markers that usually mean the model dumped CoT / system instructions into the reply. */
const COT_LEAK_RE =
  /do not mention guidelines|call search_knowledge|i must keep replies|system prompt|my (instructions|guidelines)|never invent facts|toolChoice|procedures\.|as an ai language model|chain-of-thought|I should (not|never) (reveal|mention)/i;

/**
 * Strip AI typography tells from model output before it reaches the visitor.
 * Also drops leaked thinking/system monologue when markers are present, keeping
 * the final visitor-facing block when possible.
 */
export function polishAssistantText(text: string): string {
  if (!text) return text;
  let out = text
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/ +([,.!?])/g, "$1");

  if (COT_LEAK_RE.test(out)) {
    const parts = out.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const clean = parts.filter((p) => !COT_LEAK_RE.test(p));
    if (clean.length > 0 && clean.join("\n\n").trim().length > 20) {
      out = clean.join("\n\n").trim();
    } else {
      const last = parts.at(-1) ?? "";
      if (last && !COT_LEAK_RE.test(last) && last.length > 10) out = last;
    }
  }
  return out;
}
