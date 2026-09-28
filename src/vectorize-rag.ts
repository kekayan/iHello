/** Hand-rolled RAG: Workers AI embeddings + Vectorize (+ D1 text). */

export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBED_DIMS = 768;
const CHUNK_CHARS = 900;
const CHUNK_OVERLAP = 120;
/** Prefer a single kb_docs row under this size (D1-safe). */
const D1_SAFE_CHARS = 900_000;
/** Docs ≤ ~400k use the simple single-row path; up to D1_SAFE still one row; over D1_SAFE → parts. */
/** Target size when splitting oversized docs into kb_docs parts. */
const PART_TARGET_CHARS = 300_000;
const META_URL_MAX = 500;

export type VzHit = {
  id: string;
  score: number;
  text: string;
  source_key: string;
  source_url?: string;
};

export type KbDoc = {
  id: string;
  title: string;
  text: string;
  source_url: string | null;
  updated_at: number;
};

type ChunkRow = {
  id: string;
  source_key: string;
  text: string;
  source_url?: string | null;
};

/** Vectorize caps ids at 64 bytes. */
async function shortId(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 64);
}

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_CHARS) return [clean];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + CHUNK_CHARS);
    out.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = Math.max(i + 1, end - CHUNK_OVERLAP);
  }
  return out;
}

/** Split long text on paragraph / heading boundaries (~target chars each). */
export function splitTextIntoParts(
  text: string,
  target = PART_TARGET_CHARS,
): string[] {
  const clean = text.replace(/\r/g, "");
  if (!clean) return [];
  if (clean.length <= target) return [clean];
  const parts: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const remaining = clean.length - start;
    if (remaining <= target) {
      parts.push(clean.slice(start));
      break;
    }
    const hardEnd = start + target;
    const softStart = start + Math.floor(target * 0.8);
    const window = clean.slice(softStart, hardEnd);
    let breakAt = -1;
    const para = window.lastIndexOf("\n\n");
    if (para >= 0) {
      breakAt = softStart + para + 2;
    } else {
      const h1 = window.lastIndexOf("\n# ");
      const h2 = window.lastIndexOf("\n## ");
      const h3 = window.lastIndexOf("\n### ");
      const heading = Math.max(h1, h2, h3);
      if (heading >= 0) {
        breakAt = softStart + heading + 1;
      } else {
        const nl = window.lastIndexOf("\n");
        if (nl >= 0) breakAt = softStart + nl + 1;
      }
    }
    if (breakAt <= start) breakAt = hardEnd;
    parts.push(clean.slice(start, breakAt));
    start = breakAt;
  }
  return parts.filter((p) => p.trim().length > 0);
}

function truncateUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = url.trim();
  if (!t) return null;
  return t.slice(0, META_URL_MAX);
}

export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const result = (await env.AI.run(EMBEDDING_MODEL, {
    text: texts,
  })) as { data?: number[][] } | number[][];
  if (Array.isArray(result)) return result as number[][];
  const data = (result as { data?: number[][] }).data;
  if (!data?.length) throw new Error("embed_empty");
  return data;
}

export async function embedQuery(env: Env, query: string): Promise<number[]> {
  const [v] = await embedTexts(env, [query]);
  if (!v || v.length !== EMBED_DIMS) throw new Error("embed_bad_dims");
  return v;
}

export async function upsertChunks(env: Env, rows: ChunkRow[]): Promise<number> {
  if (!rows.length) return 0;
  const vectors = await embedTexts(
    env,
    rows.map((r) => r.text),
  );
  const now = Date.now();
  await env.VECTORIZE.upsert(
    rows.map((r, i) => {
      const source_url = truncateUrl(r.source_url ?? null);
      const metadata: Record<string, string> = {
        source_key: r.source_key.slice(0, 200),
      };
      if (source_url) metadata.source_url = source_url;
      return {
        id: r.id,
        values: vectors[i]!,
        metadata,
      };
    }),
  );
  for (const r of rows) {
    const source_url = truncateUrl(r.source_url ?? null);
    await env.DB.prepare(
      `INSERT INTO vz_chunks (id, source_key, text, updated_at, source_url)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source_key = excluded.source_key,
         text = excluded.text,
         updated_at = excluded.updated_at,
         source_url = excluded.source_url`,
    )
      .bind(r.id, r.source_key, r.text, now, source_url)
      .run();
  }
  return rows.length;
}

/** Remove Vectorize vectors for ids when deleteByIds is available; D1 always cleared. */
async function deleteChunksForSource(env: Env, sourceKey: string): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM vz_chunks WHERE source_key = ?`,
  )
    .bind(sourceKey)
    .all<{ id: string }>();
  const ids = (results ?? []).map((r) => r.id);
  if (ids.length) {
    const del = (
      env.VECTORIZE as VectorizeIndex & {
        deleteByIds?: (ids: string[]) => Promise<unknown>;
      }
    ).deleteByIds;
    if (typeof del === "function") {
      try {
        const batch = 100;
        for (let i = 0; i < ids.length; i += batch) {
          await del.call(env.VECTORIZE, ids.slice(i, i + batch));
        }
      } catch (err) {
        console.log(
          "vectorize deleteByIds failed; D1 cleared, orphan vectors may remain",
          err,
        );
      }
    } else {
      console.log(
        "vectorize deleteByIds unavailable; D1 cleared, orphan vectors may remain",
      );
    }
  }
  await env.DB.prepare(`DELETE FROM vz_chunks WHERE source_key = ?`)
    .bind(sourceKey)
    .run();
}

async function listPartIds(env: Env, parentId: string): Promise<string[]> {
  const prefix = `${parentId}__p`;
  const { results } = await env.DB.prepare(
    `SELECT id FROM kb_docs WHERE id >= ? AND id < ?`,
  )
    .bind(prefix, prefix + "￿")
    .all<{ id: string }>();
  return (results ?? [])
    .map((r) => r.id)
    .filter((id) => new RegExp(`^${escapeRegExp(parentId)}__p\\d+$`).test(id));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove prior multi-part kb_docs + chunks for a parent id. */
async function deleteDocumentParts(env: Env, parentId: string): Promise<void> {
  const partIds = await listPartIds(env, parentId);
  for (const pid of partIds) {
    await deleteChunksForSource(env, pid);
    await env.DB.prepare(`DELETE FROM kb_docs WHERE id = ?`).bind(pid).run();
  }
}

async function writeKbDoc(
  env: Env,
  doc: {
    id: string;
    title: string;
    text: string;
    source_url: string | null;
    updated_at: number;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO kb_docs (id, title, text, source_url, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       text = excluded.text,
       source_url = excluded.source_url,
       updated_at = excluded.updated_at`,
  )
    .bind(doc.id, doc.title, doc.text, doc.source_url, doc.updated_at)
    .run();
}

async function chunkAndUpsert(
  env: Env,
  sourceKey: string,
  text: string,
  sourceUrl: string | null,
): Promise<number> {
  await deleteChunksForSource(env, sourceKey);
  const parts = chunkText(text);
  const rows: ChunkRow[] = [];
  for (let i = 0; i < parts.length; i++) {
    rows.push({
      id: await shortId(`${sourceKey}#${i}`),
      source_key: sourceKey,
      text: parts[i]!,
      source_url: sourceUrl,
    });
  }
  const batch = 8;
  let written = 0;
  for (let i = 0; i < rows.length; i += batch) {
    written += await upsertChunks(env, rows.slice(i, i + batch));
  }
  return written;
}

export async function ingestDocument(
  env: Env,
  doc: { id: string; title: string; text: string; source_url?: string | null },
): Promise<{ id: string; chunks: number }> {
  const id = doc.id.trim();
  if (!id) throw new Error("id required");
  const text = doc.text ?? "";
  const title = (doc.title || id).trim() || id;
  const sourceUrl = truncateUrl(
    typeof doc.source_url === "string" && doc.source_url.trim()
      ? doc.source_url.trim()
      : null,
  );
  const now = Date.now();

  // Drop any previous multi-part siblings before rewriting.
  await deleteDocumentParts(env, id);

  // Under D1-safe size: one kb_docs row (even if > soft 400k). Over: split parts.
  if (text.length <= D1_SAFE_CHARS) {
    await writeKbDoc(env, {
      id,
      title,
      text,
      source_url: sourceUrl,
      updated_at: now,
    });
    const chunks = await chunkAndUpsert(env, id, text, sourceUrl);
    return { id, chunks };
  }

  // Oversized for a single D1 row — split into ~300k parts on boundaries.
  // Remove the parent single-row doc if it existed.
  await deleteChunksForSource(env, id);
  await env.DB.prepare(`DELETE FROM kb_docs WHERE id = ?`).bind(id).run();

  const textParts = splitTextIntoParts(text, PART_TARGET_CHARS);
  let written = 0;
  for (let n = 0; n < textParts.length; n++) {
    const partId = `${id}__p${n + 1}`;
    const partTitle = `${title} (part ${n + 1})`;
    const partText = textParts[n]!;
    await writeKbDoc(env, {
      id: partId,
      title: partTitle,
      text: partText,
      source_url: sourceUrl,
      updated_at: now,
    });
    written += await chunkAndUpsert(env, partId, partText, sourceUrl);
  }
  // Keep return id as the logical parent; chunks live under __pN keys.
  return { id, chunks: written };
}

export async function deleteDocument(env: Env, id: string): Promise<void> {
  const key = id.trim();
  if (!key) throw new Error("id required");
  await deleteDocumentParts(env, key);
  await deleteChunksForSource(env, key);
  await env.DB.prepare(`DELETE FROM kb_docs WHERE id = ?`).bind(key).run();
}

export async function rebuildAllFromDocs(
  env: Env,
): Promise<{ chunks: number; sources: number }> {
  // Clear entire chunk index so prior AI Search leftovers do not linger in D1.
  const { results: oldRows } = await env.DB.prepare(
    `SELECT id FROM vz_chunks`,
  ).all<{ id: string }>();
  const oldIds = (oldRows ?? []).map((r) => r.id);
  if (oldIds.length) {
    const del = (
      env.VECTORIZE as VectorizeIndex & {
        deleteByIds?: (ids: string[]) => Promise<unknown>;
      }
    ).deleteByIds;
    if (typeof del === "function") {
      try {
        const batch = 100;
        for (let i = 0; i < oldIds.length; i += batch) {
          await del.call(env.VECTORIZE, oldIds.slice(i, i + batch));
        }
      } catch (err) {
        console.log(
          "rebuild deleteByIds failed; clearing D1, orphan vectors may remain",
          err,
        );
      }
    } else {
      console.log(
        "rebuild: deleteByIds unavailable; clearing D1, orphan vectors may remain",
      );
    }
  }
  await env.DB.prepare(`DELETE FROM vz_chunks`).run();

  const { results } = await env.DB.prepare(
    `SELECT id, title, text, source_url FROM kb_docs ORDER BY updated_at DESC`,
  ).all<{
    id: string;
    title: string;
    text: string;
    source_url: string | null;
  }>();
  const docs = results ?? [];
  // Skip __pN siblings that would be recreated from a parent — rebuild each row as-is
  // (parts are independent kb_docs after a split ingest).
  let chunks = 0;
  for (const doc of docs) {
    const result = await ingestDocument(env, {
      id: doc.id,
      title: doc.title,
      text: doc.text,
      source_url: doc.source_url,
    });
    chunks += result.chunks;
  }
  return { chunks, sources: docs.length };
}

export async function listDocs(
  env: Env,
  opts: { q?: string; limit: number; offset: number },
): Promise<{ items: KbDoc[]; total: number }> {
  const limit = Math.max(1, Math.min(100, Math.floor(opts.limit) || 20));
  const offset = Math.max(0, Math.floor(opts.offset) || 0);
  const q = (opts.q ?? "").trim();

  if (q) {
    const like = `%${q.replace(/%/g, "").replace(/_/g, "")}%`;
    const totalRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM kb_docs
       WHERE title LIKE ? COLLATE NOCASE OR id LIKE ? COLLATE NOCASE`,
    )
      .bind(like, like)
      .first<{ n: number }>();
    const { results } = await env.DB.prepare(
      `SELECT id, title, text, source_url, updated_at FROM kb_docs
       WHERE title LIKE ? COLLATE NOCASE OR id LIKE ? COLLATE NOCASE
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(like, like, limit, offset)
      .all<KbDoc>();
    return { items: results ?? [], total: totalRow?.n ?? 0 };
  }

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM kb_docs`,
  ).first<{ n: number }>();
  const { results } = await env.DB.prepare(
    `SELECT id, title, text, source_url, updated_at FROM kb_docs
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(limit, offset)
    .all<KbDoc>();
  return { items: results ?? [], total: totalRow?.n ?? 0 };
}

export async function countKbDocs(env: Env): Promise<number> {
  return (
    (await env.DB.prepare(`SELECT COUNT(*) AS n FROM kb_docs`).first<{ n: number }>())
      ?.n ?? 0
  );
}

export async function countVzChunks(env: Env): Promise<number> {
  return (
    (
      await env.DB.prepare(`SELECT COUNT(*) AS n FROM vz_chunks`).first<{
        n: number;
      }>()
    )?.n ?? 0
  );
}

export async function searchVectorize(opts: {
  env: Env;
  query: string;
  topK?: number;
}): Promise<{ hits: VzHit[]; embed_ms: number; query_ms: number }> {
  const topK = opts.topK ?? 3;
  const embedAt = Date.now();
  const values = await embedQuery(opts.env, opts.query);
  const embed_ms = Date.now() - embedAt;
  const queryAt = Date.now();
  const matches = await opts.env.VECTORIZE.query(values, {
    topK,
    returnMetadata: "all",
  });
  const query_ms = Date.now() - queryAt;
  const ids = (matches.matches ?? []).map((m) => m.id);
  const texts = new Map<
    string,
    { text: string; source_key: string; source_url: string | null }
  >();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await opts.env.DB.prepare(
      `SELECT id, text, source_key, source_url FROM vz_chunks WHERE id IN (${placeholders})`,
    )
      .bind(...ids)
      .all<{
        id: string;
        text: string;
        source_key: string;
        source_url: string | null;
      }>();
    for (const row of results ?? []) {
      texts.set(row.id, {
        text: row.text,
        source_key: row.source_key,
        source_url: row.source_url,
      });
    }
  }
  const hits: VzHit[] = (matches.matches ?? []).map((m) => {
    const row = texts.get(m.id);
    const metaUrl = String(m.metadata?.source_url ?? "");
    const source_url =
      row?.source_url ||
      (metaUrl ? metaUrl : undefined) ||
      undefined;
    return {
      id: m.id,
      score: m.score ?? 0,
      text: row?.text ?? "",
      source_key: row?.source_key ?? String(m.metadata?.source_key ?? ""),
      source_url,
    };
  });
  return { hits, embed_ms, query_ms };
}

export function hitsToContext(hits: VzHit[]): { context: string; topScore: number } {
  const usable = hits.filter((h) => h.text);
  if (!usable.length) return { context: "", topScore: 0 };
  return {
    context: usable
      .map((h) => {
        const src = h.source_url || h.source_key || "unknown";
        return `Source: ${src}\n${h.text}`;
      })
      .join("\n---\n")
      .slice(0, 2400),
    topScore: usable[0]?.score ?? 0,
  };
}
