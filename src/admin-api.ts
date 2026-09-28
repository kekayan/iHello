import { writeFeedbackEvent } from "./analytics";
import { requireAccess } from "./access";
import {
  deleteAction,
  deleteMcpServer,
  deleteSecret,
  isReservedActionName,
  listMcpServers,
  listMcpTools,
  listRegistry,
  listSecrets,
  putSecret,
  setActionEnabled,
  testAction,
  upsertAction,
  upsertMcpServer,
  type ActionKind,
} from "./actions";
import { onboardAnalyze } from "./pipeline";
import {
  hitsToContext,
  rebuildAllFromDocs,
  searchVectorize,
} from "./vectorize-rag";
import { MODEL_CATALOG, resolveModelId } from "./models";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  parseReasoningEffort,
  proceduresForPreset,
  saveSettings,
  type Settings,
} from "./settings";
import { handleKnowledge } from "./knowledge-api";
import { purgeObjects } from "./purge-objects";

const HANDOFF_STATUSES = new Set(["new", "contacted", "scheduled", "closed"]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deepMergeSettings(base: Settings, patch: Record<string, unknown>): Settings {
  const out = structuredClone(base) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = out[k];
    if (
      typeof cur === "object" &&
      cur !== null &&
      !Array.isArray(cur) &&
      typeof v === "object" &&
      v !== null &&
      !Array.isArray(v)
    ) {
      out[k] = { ...(cur as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else {
      out[k] = v;
    }
  }
  return out as unknown as Settings;
}

export async function handleAdminApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // Public feedback is handled in server.ts

  const unauth = await requireAccess(request, env);
  if (unauth) return unauth;

  if (path === "/api/models" && method === "GET") {
    return json({
      models: MODEL_CATALOG,
      default: resolveModelId(env.MODEL_MAIN_DEFAULT, env.MODEL_MAIN_DEFAULT),
      small: resolveModelId(env.MODEL_SMALL, env.MODEL_SMALL),
    });
  }

  if (path === "/api/settings" && method === "GET") {
    const settings = await loadSettings(env.DB);
    return json({
      ...settings,
      modelMain: settings.modelMain
        ? resolveModelId(settings.modelMain, settings.modelMain)
        : "",
    });
  }

  if (path === "/api/settings" && method === "PUT") {
    const body = (await request.json()) as Record<string, unknown>;
    const current = await loadSettings(env.DB);
    const presetRaw = body.preset;
    const { preset: _preset, ...patch } = body;
    void _preset;
    let next = deepMergeSettings(current, patch);
    if (body.resetBehaviour === true) {
      next = {
        ...next,
        greeting: DEFAULT_SETTINGS.greeting,
        suggestions: [...DEFAULT_SETTINGS.suggestions],
        procedures: structuredClone(DEFAULT_SETTINGS.procedures),
        variants: {},
      };
    }
    if (typeof presetRaw === "string") {
      if (presetRaw === "Lead-gen" || presetRaw === "Support") {
        next = {
          ...next,
          procedures: proceduresForPreset(presetRaw),
        };
      }
    }
    const modelRaw = String(next.modelMain ?? "").trim();
    const clean: Settings = {
      enabled: Boolean(next.enabled),
      greeting: String(next.greeting ?? DEFAULT_SETTINGS.greeting),
      suggestions: Array.isArray(next.suggestions)
        ? next.suggestions.map(String)
        : DEFAULT_SETTINGS.suggestions,
      placeholder: String(next.placeholder ?? DEFAULT_SETTINGS.placeholder),
      variants: next.variants ?? {},
      procedures: {
        ...DEFAULT_SETTINGS.procedures,
        ...(next.procedures ?? {}),
      },
      modelMain: modelRaw ? resolveModelId(modelRaw, modelRaw) : "",
      reasoningEffort: parseReasoningEffort(next.reasoningEffort),
      retentionDays: Number(next.retentionDays) || DEFAULT_SETTINGS.retentionDays,
      maxMessages: Number(next.maxMessages) || DEFAULT_SETTINGS.maxMessages,
      maxCharsPerMessage:
        Number(next.maxCharsPerMessage) || DEFAULT_SETTINGS.maxCharsPerMessage,
      autoOpenSeconds: Number(next.autoOpenSeconds) || 0,
      slaText: String(next.slaText ?? DEFAULT_SETTINGS.slaText),
    };
    await saveSettings(env.DB, clean, url.origin);
    return json(clean);
  }

  if (path === "/api/metrics" && method === "GET") {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const conversations7d =
      (
        await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM conversations WHERE started_at >= ? AND id NOT LIKE 'preview_%'`,
        )
          .bind(since)
          .first<{ n: number }>()
      )?.n ?? 0;
    const handoffs7d =
      (
        await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM handoffs WHERE created_at >= ? AND conversation_id NOT LIKE 'preview_%'`,
        )
          .bind(since)
          .first<{ n: number }>()
      )?.n ?? 0;
    const conversion = conversations7d === 0 ? 0 : handoffs7d / conversations7d;
    const userMsgs =
      (
        await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at >= ?
           AND conversation_id NOT LIKE 'preview_%'`,
        )
          .bind(since)
          .first<{ n: number }>()
      )?.n ?? 0;
    const low =
      (
        await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at >= ?
           AND conversation_id NOT LIKE 'preview_%'
           AND retrieval_score IS NOT NULL AND retrieval_score < 0.35`,
        )
          .bind(since)
          .first<{ n: number }>()
      )?.n ?? 0;
    const unansweredRate = userMsgs === 0 ? 0 : low / userMsgs;
    return json({ conversations7d, handoffs7d, conversion, unansweredRate });
  }

  if (path === "/api/conversations" && method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT id, visitor_id, page_url, referrer, handoff_id, started_at, last_message_at, message_count
       FROM conversations WHERE id NOT LIKE 'preview_%'
       ORDER BY started_at DESC LIMIT 50`,
    ).all();
    return json({ conversations: rows.results ?? [] });
  }

  if (path === "/api/traces" && method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT m.id, m.conversation_id, m.content, m.created_at, m.grounded_score, m.grounded_commit,
              m.trace_json, c.page_url
       FROM messages m
       LEFT JOIN conversations c ON c.id = m.conversation_id
       WHERE m.role = 'assistant'
         AND m.trace_json IS NOT NULL
         AND m.conversation_id NOT LIKE 'preview_%'
       ORDER BY m.created_at DESC
       LIMIT 80`,
    ).all();
    return json({ traces: rows.results ?? [] });
  }

  const convMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
  if (convMatch && method === "GET") {
    const id = decodeURIComponent(convMatch[1]!);
    const messages = await env.DB.prepare(
      `SELECT id, role, content, created_at, retrieval_score, grounded_score, grounded_commit, trace_json
       FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    )
      .bind(id)
      .all();
    return json({ id, messages: messages.results ?? [] });
  }

  if (convMatch && method === "DELETE") {
    const id = decodeURIComponent(convMatch[1]!);
    const existing = await env.DB.prepare(
      `SELECT id FROM conversations WHERE id = ?`,
    )
      .bind(id)
      .first<{ id: string }>();
    if (!existing) {
      return json({ error: "Conversation not found" }, 404);
    }
    await env.DB.prepare(`DELETE FROM messages WHERE conversation_id = ?`)
      .bind(id)
      .run();
    await env.DB.prepare(`DELETE FROM handoffs WHERE conversation_id = ?`)
      .bind(id)
      .run();
    await env.DB.prepare(`DELETE FROM conversations WHERE id = ?`)
      .bind(id)
      .run();
    return json({ ok: true, id });
  }

  if (path === "/api/handoffs" && method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT * FROM handoffs WHERE conversation_id NOT LIKE 'preview_%'
       ORDER BY created_at DESC LIMIT 200`,
    ).all();
    return json({ handoffs: rows.results ?? [] });
  }

  if (path === "/api/handoffs.csv" && method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT * FROM handoffs WHERE conversation_id NOT LIKE 'preview_%'
       ORDER BY created_at DESC LIMIT 200`,
    ).all<{
      id: string;
      type: string;
      email: string;
      phone: string | null;
      name: string;
      company: string;
      pillar: string;
      timeline: string;
      scale: string;
      summary: string;
      page_url: string;
      status: string;
      created_at: number;
      conversation_id: string;
    }>();
    const header =
      "id,type,email,phone,name,company,pillar,timeline,scale,summary,page_url,status,created_at,conversation_id";
    const lines = (rows.results ?? []).map((r) =>
      [
        r.id,
        r.type,
        r.email,
        r.phone ?? "",
        r.name,
        r.company,
        r.pillar,
        r.timeline,
        r.scale,
        JSON.stringify(r.summary ?? ""),
        r.page_url,
        r.status,
        r.created_at,
        r.conversation_id,
      ].join(","),
    );
    return new Response([header, ...lines].join("\n"), {
      headers: {
        "content-type": "text/csv",
        "content-disposition": 'attachment; filename="handoffs.csv"',
      },
    });
  }

  const handoffMatch = path.match(/^\/api\/handoffs\/([^/]+)$/);
  if (handoffMatch && method === "PATCH") {
    const id = decodeURIComponent(handoffMatch[1]!);
    const body = (await request.json()) as { status?: string };
    if (!body.status || !HANDOFF_STATUSES.has(body.status)) {
      return json({ error: "invalid status" }, 400);
    }
    await env.DB.prepare(`UPDATE handoffs SET status = ? WHERE id = ?`)
      .bind(body.status, id)
      .run();
    return json({ ok: true });
  }

  if (path === "/api/gaps" && method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT m.content AS question, m.retrieval_score AS score, c.page_url AS page
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.role = 'user' AND m.retrieval_score IS NOT NULL AND m.retrieval_score < 0.35
         AND m.conversation_id NOT LIKE 'preview_%'
       ORDER BY m.created_at DESC LIMIT 50`,
    ).all();
    return json({ gaps: rows.results ?? [] });
  }

  if (path === "/api/maintenance/purge-objects" && method === "POST") {
    if (!env.CF_API_TOKEN) {
      return json(
        {
          error:
            "CF_API_TOKEN secret is required — enumerating Durable Objects goes through the REST API.",
        },
        400,
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      cursor?: string;
      limit?: number;
      dryRun?: boolean;
    };
    try {
      return json(
        await purgeObjects(env, {
          cursor: body.cursor,
          limit: body.limit,
          dryRun: body.dryRun === true,
        }),
      );
    } catch (err) {
      return json({ error: String(err instanceof Error ? err.message : err) }, 502);
    }
  }

  if (path === "/api/onboard/analyze" && method === "POST") {
    const draft = await onboardAnalyze({ env, defaults: DEFAULT_SETTINGS });
    return json({ draft });
  }

  if (path === "/api/knowledge/vectorize-sync" && method === "POST") {
    try {
      const result = await rebuildAllFromDocs(env);
      return json({ ok: true, ...result });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  if (path.startsWith("/api/knowledge")) {
    return handleKnowledge(request, env, ctx);
  }

  // ─── Actions registry ───
  if (path === "/api/actions" && method === "GET") {
    return json({ actions: await listRegistry(env.DB) });
  }

  if (path === "/api/actions" && method === "PUT") {
    try {
      const body = (await request.json()) as {
        name?: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
        kind?: ActionKind;
        config?: Record<string, unknown>;
        secretRef?: string | null;
        confirmRequired?: boolean;
        enabled?: boolean;
      };
      if (!body.name || !body.description || !body.kind) {
        return json({ error: "name, description, kind required" }, 400);
      }
      const action = await upsertAction(env.DB, {
        name: body.name,
        description: body.description,
        inputSchema: body.inputSchema || { type: "object", properties: {} },
        kind: body.kind,
        config: body.config || {},
        secretRef: body.secretRef,
        confirmRequired: body.confirmRequired,
        enabled: body.enabled,
      });
      return json({ action });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  const actionMatch = path.match(/^\/api\/actions\/([^/]+)(?:\/(test|enabled))?$/);
  if (actionMatch) {
    const name = decodeURIComponent(actionMatch[1]!);
    const sub = actionMatch[2];

    if (sub === "test" && method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { input?: unknown };
      const result = await testAction({
        db: env.DB,
        name,
        input: body.input,
      });
      return json(result);
    }

    if (sub === "enabled" && method === "PATCH") {
      try {
        const body = (await request.json()) as { enabled?: boolean };
        const action = await setActionEnabled(env.DB, name, Boolean(body.enabled));
        return json({ action });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }

    if (!sub && method === "DELETE") {
      try {
        if (isReservedActionName(name)) {
          return json({ error: "Cannot delete a built-in." }, 400);
        }
        await deleteAction(env.DB, name);
        return json({ ok: true });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }
  }

  if (path === "/api/secrets" && method === "GET") {
    return json({ secrets: await listSecrets(env.DB) });
  }

  if (path === "/api/secrets" && method === "PUT") {
    try {
      const body = (await request.json()) as { name?: string; value?: string };
      if (!body.name || typeof body.value !== "string") {
        return json({ error: "name and value required" }, 400);
      }
      const secret = await putSecret(env.DB, body.name, body.value);
      return json({ secret });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  const secretMatch = path.match(/^\/api\/secrets\/([^/]+)$/);
  if (secretMatch && method === "DELETE") {
    await deleteSecret(env.DB, decodeURIComponent(secretMatch[1]!));
    return json({ ok: true });
  }

  if (path === "/api/mcp-servers" && method === "GET") {
    return json({ servers: await listMcpServers(env.DB) });
  }

  if (path === "/api/mcp-servers" && method === "PUT") {
    try {
      const body = (await request.json()) as {
        id?: string;
        name?: string;
        url?: string;
        transport?: "http" | "sse";
        allowedTools?: string[];
        secretRef?: string | null;
        enabled?: boolean;
      };
      if (!body.name || !body.url) {
        return json({ error: "name and url required" }, 400);
      }
      const server = await upsertMcpServer(env.DB, {
        id: body.id,
        name: body.name,
        url: body.url,
        transport: body.transport,
        allowedTools: body.allowedTools || [],
        secretRef: body.secretRef,
        enabled: body.enabled,
      });
      return json({ server });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  const mcpMatch = path.match(/^\/api\/mcp-servers\/([^/]+)(?:\/(tools|test))?$/);
  if (mcpMatch) {
    const id = decodeURIComponent(mcpMatch[1]!);
    const sub = mcpMatch[2];
    if (sub === "tools" && method === "GET") {
      return json(await listMcpTools(env.DB, id));
    }
    if (sub === "test" && method === "POST") {
      const listed = await listMcpTools(env.DB, id);
      if (listed.error) return json({ ok: false, ...listed });
      return json({
        ok: true,
        message: `connected · ${listed.tools.length} tools found`,
        tools: listed.tools,
      });
    }
    if (!sub && method === "DELETE") {
      await deleteMcpServer(env.DB, id);
      return json({ ok: true });
    }
  }

  if (path === "/api/bench/retrieve" && method === "POST") {
    try {
      const body = (await request.json()) as { query?: string; topK?: number };
      const query = String(body.query || "").trim();
      if (!query) return json({ error: "query required" }, 400);
      const topK = Number(body.topK) || 3;

      const vzAt = Date.now();
      let vectorize: unknown;
      let vectorize_ms = 0;
      let vz_err: string | null = null;
      try {
        const vz = await searchVectorize({ env, query, topK });
        vectorize_ms = Date.now() - vzAt;
        const ctx = hitsToContext(vz.hits);
        vectorize = {
          embed_ms: vz.embed_ms,
          query_ms: vz.query_ms,
          chunk_count: vz.hits.length,
          top_score: ctx.topScore || null,
          preview: vz.hits.slice(0, 2).map((h) => ({
            score: h.score,
            key: h.source_key,
            text: h.text.slice(0, 160),
          })),
        };
      } catch (e) {
        vectorize_ms = Date.now() - vzAt;
        vz_err = e instanceof Error ? e.message : String(e);
      }

      return json({
        query,
        vectorize_ms,
        winner: vz_err ? "neither" : "vectorize",
        vectorize,
        vz_err,
      });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  return json({ error: "not found" }, 404);
}

export async function handlePublicFeedback(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method.toUpperCase() !== "POST") {
    return json({ error: "method" }, 405);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const { success } = await env.RATE_LIMITER.limit({ key: `fb:${ip}` });
  if (!success) return json({ error: "rate" }, 429);
  const body = (await request.json()) as {
    conversation_id?: string;
    rating?: "up" | "down";
    page_url?: string;
  };
  if (!body.conversation_id || (body.rating !== "up" && body.rating !== "down")) {
    return json({ error: "invalid" }, 400);
  }
  writeFeedbackEvent(env.AE, body.page_url ?? "", body.rating, body.conversation_id);
  return json({ ok: true });
}
