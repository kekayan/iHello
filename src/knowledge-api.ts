function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function base(env: Env): string {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai-search/instances/${env.AI_SEARCH_INSTANCE}`;
}

function authHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.CF_API_TOKEN ?? ""}`,
  };
}

async function resolveItemIdByName(env: Env, name: string): Promise<string | null> {
  const res = await fetch(`${base(env)}/items?key=${encodeURIComponent(name)}`, {
    headers: authHeaders(env),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    result?: Array<{ id?: string; key?: string }>;
  };
  const hit = (data.result ?? []).find((r) => r.key === name) ?? data.result?.[0];
  return hit?.id ?? null;
}

export async function handleKnowledge(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (!env.CF_API_TOKEN || env.CF_ACCOUNT_ID === "REPLACE") {
    return json({ error: "knowledge API not configured" }, 503);
  }

  if (path === "/api/knowledge/files" && method === "GET") {
    const res = await fetch(`${base(env)}/items`, { headers: authHeaders(env) });
    const data = await res.json();
    return json(data, res.status);
  }

  if (path === "/api/knowledge/files" && method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    let form: FormData;
    if (contentType.includes("multipart/form-data")) {
      form = await request.formData();
    } else {
      const body = (await request.json()) as { filename?: string; content?: string };
      if (!body.filename || typeof body.content !== "string") {
        return json({ error: "filename and content required" }, 400);
      }
      form = new FormData();
      form.append(
        "file",
        new Blob([body.content], { type: "text/markdown" }),
        body.filename,
      );
    }
    const res = await fetch(`${base(env)}/items`, {
      method: "POST",
      headers: authHeaders(env),
      body: form,
    });
    const data = await res.json();
    return json(data, res.status);
  }

  const delMatch = path.match(/^\/api\/knowledge\/files\/(.+)$/);
  if (delMatch && method === "DELETE") {
    const name = decodeURIComponent(delMatch[1]!);
    const itemId = await resolveItemIdByName(env, name);
    if (!itemId) return json({ error: "not found" }, 404);
    const res = await fetch(`${base(env)}/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      headers: authHeaders(env),
    });
    const text = await res.text();
    try {
      return json(JSON.parse(text), res.status);
    } catch {
      return new Response(text, { status: res.status });
    }
  }

  if (path === "/api/knowledge/sync" && method === "POST") {
    const res = await fetch(`${base(env)}/jobs`, {
      method: "POST",
      headers: authHeaders(env),
    });
    const data = await res.json();
    return json(data, res.status);
  }

  if (path === "/api/knowledge/status" && method === "GET") {
    const res = await fetch(`${base(env)}/stats`, { headers: authHeaders(env) });
    const data = await res.json();
    return json(data, res.status);
  }

  return json({ error: "not found" }, 404);
}
