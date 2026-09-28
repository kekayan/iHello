import {
  discoverCrawlTargets,
  fetchPageForIndex,
  MAX_IMPORT_BATCH,
  parseImportUrl,
} from "./fetch-page";
import {
  countKbDocs,
  countVzChunks,
  deleteDocument,
  ingestDocument,
  listDocs,
} from "./vectorize-rag";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, "").trim() || filename;
  return base.replace(/\.[^.]+$/, "") || base;
}

async function readUploadBody(
  request: Request,
): Promise<{ filename: string; content: string }> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("file required");
    }
    return { filename: file.name, content: await file.text() };
  }
  const body = (await request.json()) as { filename?: string; content?: string };
  if (!body.filename || typeof body.content !== "string") {
    throw new Error("filename and content required");
  }
  return { filename: body.filename, content: body.content };
}

export async function handleKnowledge(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  try {
    if (path === "/api/knowledge/website") {
      return json(
        {
          error: "gone",
          message: "Website crawler removed; use Import pages or Markdown.",
          connected: false,
        },
        410,
      );
    }

    if (path === "/api/knowledge/sync" && method === "POST") {
      return json(
        {
          error: "gone",
          message: "Use Rebuild index (vectorize-sync) instead of Re-index.",
        },
        410,
      );
    }

    if (path === "/api/knowledge/discover" && method === "POST") {
      const body = (await request.json()) as { url?: string };
      if (!body.url || typeof body.url !== "string") {
        return json({ error: "url required" }, 400);
      }
      const discovered = await discoverCrawlTargets(body.url);
      return json(discovered);
    }

    if (path === "/api/knowledge/import-url" && method === "POST") {
      const body = (await request.json()) as { url?: string; urls?: string[] };
      const urls: string[] = [];
      if (Array.isArray(body.urls)) {
        for (const u of body.urls) {
          if (typeof u === "string" && u.trim()) urls.push(u.trim());
        }
      } else if (typeof body.url === "string" && body.url.trim()) {
        urls.push(body.url.trim());
      }
      if (!urls.length) return json({ error: "url or urls required" }, 400);
      if (urls.length > MAX_IMPORT_BATCH) {
        return json(
          { error: `at most ${MAX_IMPORT_BATCH} urls per import` },
          400,
        );
      }

      for (const u of urls) parseImportUrl(u);

      const imported: Array<{
        filename: string;
        sourceUrl: string;
        chunks: number;
      }> = [];
      const failed: Array<{ url: string; error: string }> = [];

      for (const u of urls) {
        try {
          const page = await fetchPageForIndex(u);
          const result = await ingestDocument(env, {
            id: page.filename,
            title: titleFromFilename(page.filename),
            text: page.content,
            source_url: page.sourceUrl,
          });
          imported.push({
            filename: page.filename,
            sourceUrl: page.sourceUrl,
            chunks: result.chunks,
          });
        } catch (err) {
          failed.push({
            url: u,
            error: err instanceof Error ? err.message : "import failed",
          });
        }
      }

      return json({
        imported,
        failed,
        filename: imported[0]?.filename,
        sourceUrl: imported[0]?.sourceUrl,
      });
    }

    if (path === "/api/knowledge/files" && method === "GET") {
      const limit = Number(url.searchParams.get("limit")) || 20;
      const offset = Number(url.searchParams.get("offset")) || 0;
      const q = url.searchParams.get("q") || undefined;
      const { items, total } = await listDocs(env, { q, limit, offset });
      const result = items.map((d) => ({
        key: d.id,
        id: d.id,
        name: d.id,
        title: d.title,
        source_url: d.source_url,
        updated_at: d.updated_at,
      }));
      return json({
        result,
        files: result,
        result_info: {
          total_count: total,
          limit: Math.max(1, Math.min(100, Math.floor(limit) || 20)),
          offset: Math.max(0, Math.floor(offset) || 0),
          count: result.length,
        },
      });
    }

    if (path === "/api/knowledge/files" && method === "POST") {
      let filename: string;
      let content: string;
      try {
        ({ filename, content } = await readUploadBody(request));
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : "bad request" },
          400,
        );
      }
      const id = filename.trim();
      if (!id) return json({ error: "filename required" }, 400);
      const uploaded = await ingestDocument(env, {
        id,
        title: titleFromFilename(id),
        text: content,
        source_url: null,
      });
      return json({
        result: {
          id: uploaded.id,
          key: uploaded.id,
          chunks: uploaded.chunks,
        },
      });
    }

    const delMatch = path.match(/^\/api\/knowledge\/files\/(.+)$/);
    if (delMatch && method === "DELETE") {
      const name = decodeURIComponent(delMatch[1]!);
      await deleteDocument(env, name);
      return json({ ok: true, purged: true, key: name, id: name });
    }

    if (path === "/api/knowledge/status" && method === "GET") {
      const [docs, chunks] = await Promise.all([
        countKbDocs(env),
        countVzChunks(env),
      ]);
      return json({
        result: {
          total: docs,
          docs,
          chunks,
          by_status: { ready: docs },
          website: {
            connected: false,
            instance: null,
            source: null,
            status: null,
            type: null,
            stats: null,
          },
        },
      });
    }

    return json({ error: "not found" }, 404);
  } catch (err) {
    console.log("knowledge error", err);
    return json(
      {
        error: err instanceof Error ? err.message : "knowledge failed",
      },
      502,
    );
  }
}
