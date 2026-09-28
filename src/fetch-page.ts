const MAX_BYTES = 8_000_000;
const MAX_CHARS = 1_000_000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;
const MAX_DISCOVER_TARGETS = 100;
const MAX_IMPORT_BATCH = 25;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.",
  "metadata.google.internal",
  "metadata",
]);

const SKIP_PATH_EXT =
  /\.(css|js|mjs|map|json|xml|rss|atom|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp[34]|webm|pdf|zip|gz|tgz|rar|7z|dmg|exe|bin)(\?|$)/i;

export type CrawlTarget = {
  url: string;
  label: string;
  source: "seed" | "page" | "sitemap";
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(Number.parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) =>
      String.fromCodePoint(Number.parseInt(d, 10)),
    );
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map((p) => Number(p));
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return true;
  }
  return false;
}

/** Normalize and reject non-public http(s) targets (SSRF guard). */
export function parseImportUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("url required");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("invalid url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("only http(s) urls allowed");
  }
  if (!url.hostname || isPrivateOrLocalHostname(url.hostname)) {
    throw new Error("url host not allowed");
  }
  if (!url.hostname.includes(".")) {
    throw new Error("invalid domain");
  }
  return url;
}

function assertSafeUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("only http(s) urls allowed");
  }
  if (isPrivateOrLocalHostname(url.hostname)) {
    throw new Error("url host not allowed");
  }
}

function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function sameSite(a: URL, b: URL): boolean {
  return hostKey(a.hostname) === hostKey(b.hostname);
}

/** Canonical form for dedupe — strip hash, drop default ports, trim trailing slash. */
export function canonicalizeUrl(url: URL): string {
  const u = new URL(url.toString());
  u.hash = "";
  if (
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443")
  ) {
    u.port = "";
  }
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  u.pathname = path || "/";
  return u.toString();
}

function labelFromUrl(url: URL, linkText?: string): string {
  const text = (linkText || "").replace(/\s+/g, " ").trim();
  if (text && text.length <= 80 && !/^https?:\/\//i.test(text)) return text;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return path === "/" ? url.hostname : path;
}

function shouldSkipHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return true;
  if (/^(mailto|tel|javascript|data):/i.test(trimmed)) return true;
  if (SKIP_PATH_EXT.test(trimmed)) return true;
  return false;
}

export function filenameFromUrl(url: URL): string {
  const host = url.hostname.replace(/^www\./, "");
  let path = url.pathname.replace(/\/+$/, "") || "index";
  path = path.replace(/^\//, "").replace(/\//g, "__");
  path = path.replace(/\.(html?|php|aspx?)$/i, "");
  const base = `${host}__${path || "index"}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return `${base || "page"}.md`;
}

export function htmlToMarkdown(html: string, sourceUrl: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeEntities(titleMatch[1]!.replace(/<[^>]+>/g, "")).trim()
    : "";

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const main =
    body.match(/<main\b[^>]*>[\s\S]*?<\/main>/i) ||
    body.match(/<article\b[^>]*>[\s\S]*?<\/article>/i);
  if (main) body = main[0]!;

  body = body
    .replace(/<h1\b[^>]*>/gi, "\n# ")
    .replace(/<h2\b[^>]*>/gi, "\n## ")
    .replace(/<h3\b[^>]*>/gi, "\n### ")
    .replace(/<h[4-6]\b[^>]*>/gi, "\n#### ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|tr|blockquote)>/gi, "\n\n")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
      const label = decodeEntities(text.replace(/<[^>]+>/g, "")).trim();
      return label ? `[${label}](${href})` : href;
    })
    .replace(/<[^>]+>/g, " ");

  const text = decodeEntities(body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_CHARS);

  if (!text) throw new Error("no readable text on page");

  const header = title ? `# ${title}\n\n` : "";
  return `${header}Source: ${sourceUrl}\n\n${text}\n`;
}

async function fetchFollowingRedirects(start: URL): Promise<{ response: Response; finalUrl: URL }> {
  let current = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    assertSafeUrl(current);
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml,text/xml,text/plain,text/markdown;q=0.9,*/*;q=0.1",
        "user-agent": "iHello-KnowledgeImport/1.0 (+https://hello.kekayan.com)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("location");
      if (!loc) throw new Error("redirect without location");
      current = new URL(loc, current);
      continue;
    }

    return { response, finalUrl: current };
  }
  throw new Error("too many redirects");
}

async function readBodyText(response: Response): Promise<string> {
  // Prefer truncating huge HTML over failing — htmlToMarkdown keeps ≤ MAX_CHARS of text.
  const len = Number(response.headers.get("content-length") || "0");
  if (len > MAX_BYTES * 4) {
    throw new Error(`page too large (${Math.round(len / 1_000_000)}MB)`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const buf = await response.arrayBuffer();
    const slice = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    return new TextDecoder("utf-8").decode(slice);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    const room = MAX_BYTES - total;
    if (room <= 0) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    if (value.byteLength <= room) {
      chunks.push(value);
      total += value.byteLength;
    } else {
      chunks.push(value.slice(0, room));
      total += room;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(out);
}

function extractPageLinks(html: string, base: URL): CrawlTarget[] {
  const out: CrawlTarget[] = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1]!;
    if (shouldSkipHref(href)) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (!sameSite(resolved, base)) continue;
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (isPrivateOrLocalHostname(resolved.hostname)) continue;
    const label = labelFromUrl(
      resolved,
      decodeEntities(match[2]!.replace(/<[^>]+>/g, "")),
    );
    out.push({
      url: canonicalizeUrl(resolved),
      label,
      source: "page",
    });
  }
  return out;
}

function extractSitemapLocs(xml: string, base: URL): CrawlTarget[] {
  const out: CrawlTarget[] = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const raw = decodeEntities(match[1]!.trim());
    if (shouldSkipHref(raw)) continue;
    let resolved: URL;
    try {
      resolved = new URL(raw, base);
    } catch {
      continue;
    }
    if (!sameSite(resolved, base)) continue;
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (isPrivateOrLocalHostname(resolved.hostname)) continue;
    if (/sitemap/i.test(resolved.pathname) && resolved.pathname.endsWith(".xml")) continue;
    out.push({
      url: canonicalizeUrl(resolved),
      label: labelFromUrl(resolved),
      source: "sitemap",
    });
  }
  return out;
}

async function tryFetchSitemap(origin: URL): Promise<CrawlTarget[]> {
  const candidates = [
    new URL("/sitemap.xml", origin),
    new URL("/sitemap_index.xml", origin),
  ];
  const found: CrawlTarget[] = [];
  for (const start of candidates) {
    try {
      assertSafeUrl(start);
      const { response, finalUrl } = await fetchFollowingRedirects(start);
      if (!response.ok) continue;
      const ctype = (response.headers.get("content-type") || "").toLowerCase();
      const text = await readBodyText(response);
      if (
        !ctype.includes("xml") &&
        !ctype.includes("text/") &&
        !text.trimStart().startsWith("<")
      ) {
        continue;
      }
      found.push(...extractSitemapLocs(text, finalUrl));
      if (found.length) break;
    } catch {
      // Sitemap optional.
    }
  }
  return found;
}

function mergeTargets(targets: CrawlTarget[]): CrawlTarget[] {
  const byUrl = new Map<string, CrawlTarget>();
  for (const t of targets) {
    const prev = byUrl.get(t.url);
    if (!prev) {
      byUrl.set(t.url, t);
      continue;
    }
    if (prev.source === "sitemap" && t.source === "page") {
      byUrl.set(t.url, t);
    } else if (
      prev.source === t.source &&
      t.label.length > prev.label.length &&
      t.label.length <= 80
    ) {
      byUrl.set(t.url, t);
    }
  }
  return [...byUrl.values()].slice(0, MAX_DISCOVER_TARGETS);
}

/** Find same-site pages from the seed HTML + optional sitemap (no deep crawl). */
export async function discoverCrawlTargets(rawUrl: string): Promise<{
  seed: string;
  targets: CrawlTarget[];
}> {
  const start = parseImportUrl(rawUrl);
  const { response, finalUrl } = await fetchFollowingRedirects(start);
  if (!response.ok) throw new Error(`fetch failed (${response.status})`);

  const ctype = (response.headers.get("content-type") || "").toLowerCase();
  const text = await readBodyText(response);
  const seed = canonicalizeUrl(finalUrl);
  const collected: CrawlTarget[] = [
    { url: seed, label: labelFromUrl(finalUrl, "This page"), source: "seed" },
  ];

  if (
    !ctype ||
    ctype.includes("text/html") ||
    ctype.includes("application/xhtml") ||
    ctype.includes("text/")
  ) {
    collected.push(...extractPageLinks(text, finalUrl));
  }

  collected.push(...(await tryFetchSitemap(finalUrl)));

  return { seed, targets: mergeTargets(collected) };
}

export async function fetchPageForIndex(rawUrl: string): Promise<{
  filename: string;
  content: string;
  sourceUrl: string;
}> {
  const start = parseImportUrl(rawUrl);
  const { response, finalUrl } = await fetchFollowingRedirects(start);

  if (!response.ok) {
    throw new Error(`fetch failed (${response.status})`);
  }

  const text = await readBodyText(response);
  const ctype = (response.headers.get("content-type") || "").toLowerCase();
  const sourceUrl = finalUrl.toString();
  const filename = filenameFromUrl(finalUrl);

  if (
    ctype.includes("text/plain") ||
    ctype.includes("text/markdown") ||
    ctype.includes("text/md")
  ) {
    const content = `Source: ${sourceUrl}\n\n${text.trim().slice(0, MAX_CHARS)}\n`;
    if (!content.trim()) throw new Error("empty page");
    return { filename, content, sourceUrl };
  }

  if (
    ctype &&
    !ctype.includes("text/html") &&
    !ctype.includes("application/xhtml") &&
    !ctype.includes("text/")
  ) {
    throw new Error("unsupported content type (need html or text)");
  }

  return {
    filename,
    content: htmlToMarkdown(text, sourceUrl),
    sourceUrl,
  };
}

export { MAX_IMPORT_BATCH, MAX_CHARS };
