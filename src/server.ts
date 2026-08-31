import { routeAgentRequest } from "agents";
import { handleAdminApi, handlePublicFeedback } from "./admin-api";
import { ChatAgent } from "./chat-agent";
import { loadSettings, resolveVariant } from "./settings";

export { ChatAgent };

async function serveAdminSpa(env: Env, origin: string): Promise<Response> {
  const assetRes = await env.ASSETS.fetch(new Request(new URL("/admin/index.html", origin)));
  const buf = await assetRes.arrayBuffer();
  const cleaned = new Uint8Array(buf).filter((b) => b !== 0);
  return new Response(cleaned, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

async function handleConfig(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const cacheKey = new Request(url.origin + "/config", request);
  const cache = await caches.open("cfg");
  let settingsJson: SettingsPayload | null = null;

  const cached = await cache.match(cacheKey);
  if (cached) {
    settingsJson = (await cached.json()) as SettingsPayload;
  } else {
    const settings = await loadSettings(env.DB);
    settingsJson = {
      enabled: settings.enabled,
      greeting: settings.greeting,
      suggestions: settings.suggestions,
      placeholder: settings.placeholder,
      variants: settings.variants,
      autoOpenSeconds: settings.autoOpenSeconds,
      turnstileSiteKey: env.TURNSTILE_SITE_KEY,
    };
    const res = new Response(JSON.stringify(settingsJson), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
      },
    });
    await cache.put(cacheKey, res.clone());
  }

  const page = url.searchParams.get("page") || "/";
  const resolved = resolveVariant(
    {
      enabled: settingsJson.enabled,
      greeting: settingsJson.greeting,
      suggestions: settingsJson.suggestions,
      placeholder: settingsJson.placeholder,
      variants: settingsJson.variants,
      procedures: {
        identity: "",
        answering: "",
        lead: "",
        escalation: "",
      },
      modelMain: "",
      retentionDays: 90,
      maxMessages: 40,
      maxCharsPerMessage: 2000,
      autoOpenSeconds: settingsJson.autoOpenSeconds,
      slaText: "",
    },
    page,
  );

  return Response.json({
    ...resolved,
    turnstileSiteKey: settingsJson.turnstileSiteKey,
  });
}

interface SettingsPayload {
  enabled: boolean;
  greeting: string;
  suggestions: string[];
  placeholder: string;
  variants: Record<string, { greeting?: string; suggestions?: string[] }>;
  autoOpenSeconds: number;
  turnstileSiteKey: string;
}

async function handleScheduled(env: Env): Promise<void> {
  const settings = await loadSettings(env.DB);
  const cutoff = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000;

  await env.DB.prepare(
    `DELETE FROM messages WHERE conversation_id IN (
       SELECT id FROM conversations WHERE handoff_id IS NULL AND started_at < ?
     )`,
  )
    .bind(cutoff)
    .run();
  await env.DB.prepare(
    `DELETE FROM conversations WHERE handoff_id IS NULL AND started_at < ?`,
  )
    .bind(cutoff)
    .run();

  await env.DB.prepare(`DELETE FROM messages WHERE conversation_id LIKE 'preview_%'`).run();
  await env.DB.prepare(`DELETE FROM handoffs WHERE conversation_id LIKE 'preview_%'`).run();
  await env.DB.prepare(`DELETE FROM conversations WHERE id LIKE 'preview_%'`).run();
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/config") {
      return handleConfig(request, env);
    }

    if (url.pathname === "/feedback") {
      return handlePublicFeedback(request, env);
    }

    if (url.pathname === "/admin.html") {
      return Response.redirect(`${url.origin}/admin/`, 302);
    }

    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return serveAdminSpa(env, url.origin);
    }

    if (url.pathname.startsWith("/admin/")) {
      // Client-side router paths → SPA shell; hashed assets served from ASSETS.
      const asset = await env.ASSETS.fetch(new Request(url.toString(), request));
      if (asset.status !== 404) return asset;
      return serveAdminSpa(env, url.origin);
    }

    if (url.pathname.startsWith("/api/")) {
      return handleAdminApi(request, env, ctx);
    }

    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    await handleScheduled(env);
  },
} satisfies ExportedHandler<Env>;
