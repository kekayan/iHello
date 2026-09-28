/** Safe subset markdown → HTML (escape first; no raw HTML passthrough). */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdown(escaped: string): string {
  let s = escaped;
  // Inline code
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold then italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  // Links [label](https://...)
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return s;
}

/** Render a limited markdown dialect for chat bubbles. */
export function renderMarkdown(src: string): string {
  const normalized = src.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized.trim()) return "";

  const lines = normalized.split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trimStart().startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      parts.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        const item = (lines[i] ?? "").replace(/^\s*[-*]\s+/, "");
        items.push(`<li>${inlineMarkdown(escapeHtml(item))}</li>`);
        i += 1;
      }
      parts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        const item = (lines[i] ?? "").replace(/^\s*\d+\.\s+/, "");
        items.push(`<li>${inlineMarkdown(escapeHtml(item))}</li>`);
        i += 1;
      }
      parts.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Heading
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 2;
      const text = heading[2] ?? "";
      parts.push(`<h${level}>${inlineMarkdown(escapeHtml(text))}</h${level}>`);
      i += 1;
      continue;
    }

    // Paragraph (consume until blank)
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim()) {
      const cur = lines[i] ?? "";
      if (
        cur.trimStart().startsWith("```") ||
        /^\s*[-*]\s+/.test(cur) ||
        /^\s*\d+\.\s+/.test(cur) ||
        /^#{1,3}\s+/.test(cur)
      ) {
        break;
      }
      para.push(cur);
      i += 1;
    }
    parts.push(`<p>${inlineMarkdown(escapeHtml(para.join("\n"))).replace(/\n/g, "<br />")}</p>`);
  }

  return parts.join("");
}
