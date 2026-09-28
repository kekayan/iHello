/**
 * Actions registry — built-ins, HTTP tools, MCP (allowlisted), write-only secrets.
 */

export type ActionKind = "http" | "static" | "mcp";

export type ActionRow = {
  name: string;
  description: string;
  input_schema: string;
  kind: ActionKind;
  config: string;
  secret_ref: string | null;
  confirm_required: number;
  enabled: number;
  use_count: number;
  last_used_at: number | null;
  last_error: string | null;
  last_error_at: number | null;
  updated_at: number | null;
};

export type ActionPublic = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kind: ActionKind | "builtin";
  config: Record<string, unknown>;
  secretRef: string | null;
  hasSecret: boolean;
  confirmRequired: boolean;
  enabled: boolean;
  useCount: number;
  lastUsedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  builtin: boolean;
  updatedAt: number | null;
};

export type McpServerRow = {
  id: string;
  name: string;
  url: string;
  transport: string;
  allowed_tools: string;
  secret_ref: string | null;
  enabled: number;
  use_count: number;
  last_used_at: number | null;
  last_error: string | null;
  last_error_at: number | null;
  updated_at: number;
};

export type McpServerPublic = {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse";
  allowedTools: string[];
  secretRef: string | null;
  hasSecret: boolean;
  enabled: boolean;
  useCount: number;
  lastUsedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  updatedAt: number;
};

export type SecretPublic = {
  name: string;
  updatedAt: number;
  /** Never expose the value — write-only. */
  hasValue: true;
};

const RESERVED = new Set(["handoff", "book_meeting", "search_knowledge"]);
const NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;

export const BUILTIN_ACTIONS: ActionPublic[] = [
  {
    name: "handoff",
    description:
      "Record a lead or support handoff to a human (built-in).",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["lead", "support"] },
        email: { type: "string" },
        phone: { type: "string" },
        summary: { type: "string" },
      },
      required: ["type", "summary"],
    },
    kind: "builtin",
    config: {},
    secretRef: null,
    hasSecret: false,
    confirmRequired: false,
    enabled: true,
    useCount: 0,
    lastUsedAt: null,
    lastError: null,
    lastErrorAt: null,
    builtin: true,
    updatedAt: null,
  },
  {
    name: "book_meeting",
    description: "Return the booking URL to share with the visitor (built-in).",
    inputSchema: { type: "object", properties: {}, required: [] },
    kind: "builtin",
    config: {},
    secretRef: null,
    hasSecret: false,
    confirmRequired: false,
    enabled: true,
    useCount: 0,
    lastUsedAt: null,
    lastError: null,
    lastErrorAt: null,
    builtin: true,
    updatedAt: null,
  },
  {
    name: "search_knowledge",
    description: "Search the site knowledge base again (built-in).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    kind: "builtin",
    config: {},
    secretRef: null,
    hasSecret: false,
    confirmRequired: false,
    enabled: true,
    useCount: 0,
    lastUsedAt: null,
    lastError: null,
    lastErrorAt: null,
    builtin: true,
    updatedAt: null,
  },
];

export function isReservedActionName(name: string): boolean {
  return RESERVED.has(name);
}

export function validateActionName(name: string): string | null {
  if (!NAME_RE.test(name)) {
    return "Name must be snake_case, start with a letter, max 64 chars.";
  }
  if (isReservedActionName(name)) {
    return "Name is reserved for a built-in tool.";
  }
  return null;
}

function parseJsonObject(raw: string, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function parseStringArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  } catch {
    /* ignore */
  }
  return [];
}

export function rowToPublic(row: ActionRow): ActionPublic {
  const kind = row.kind;
  return {
    name: row.name,
    description: row.description,
    inputSchema: parseJsonObject(row.input_schema, {
      type: "object",
      properties: {},
    }),
    kind,
    config: parseJsonObject(row.config),
    secretRef: row.secret_ref,
    hasSecret: Boolean(row.secret_ref),
    confirmRequired: row.confirm_required === 1,
    enabled: row.enabled === 1,
    useCount: row.use_count || 0,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    builtin: false,
    updatedAt: row.updated_at,
  };
}

export function mcpToPublic(row: McpServerRow): McpServerPublic {
  const transport = row.transport === "sse" ? "sse" : "http";
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport,
    allowedTools: parseStringArray(row.allowed_tools),
    secretRef: row.secret_ref,
    hasSecret: Boolean(row.secret_ref),
    enabled: row.enabled === 1,
    useCount: row.use_count || 0,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    updatedAt: row.updated_at,
  };
}

export async function listActionRows(db: D1Database): Promise<ActionRow[]> {
  const res = await db
    .prepare(
      `SELECT name, description, input_schema, kind, config, secret_ref,
              confirm_required, enabled, use_count, last_used_at, last_error,
              last_error_at, updated_at
       FROM actions ORDER BY name`,
    )
    .all<ActionRow>();
  return res.results ?? [];
}

export async function listRegistry(db: D1Database): Promise<ActionPublic[]> {
  const rows = await listActionRows(db);
  const overrideByName = new Map(rows.map((r) => [r.name, r]));
  const builtins = BUILTIN_ACTIONS.map((b) => {
    const override = overrideByName.get(b.name);
    if (!override) return b;
    return {
      ...b,
      enabled: override.enabled === 1,
      updatedAt: override.updated_at,
    };
  });
  const custom = rows
    .filter((r) => !isReservedActionName(r.name))
    .map(rowToPublic);
  return [...builtins, ...custom];
}

/** Enabled flags for built-in tools (default true; D1 overrides win). */
export async function loadBuiltinEnabled(
  db: D1Database,
): Promise<Record<string, boolean>> {
  const enabled: Record<string, boolean> = {};
  for (const b of BUILTIN_ACTIONS) enabled[b.name] = true;
  if (BUILTIN_ACTIONS.length === 0) return enabled;
  const placeholders = BUILTIN_ACTIONS.map(() => "?").join(", ");
  const res = await db
    .prepare(
      `SELECT name, enabled FROM actions WHERE name IN (${placeholders})`,
    )
    .bind(...BUILTIN_ACTIONS.map((b) => b.name))
    .all<{ name: string; enabled: number }>();
  for (const row of res.results ?? []) {
    enabled[row.name] = row.enabled === 1;
  }
  return enabled;
}

export async function getAction(
  db: D1Database,
  name: string,
): Promise<ActionRow | null> {
  return (
    (await db
      .prepare(
        `SELECT name, description, input_schema, kind, config, secret_ref,
                confirm_required, enabled, use_count, last_used_at, last_error,
                last_error_at, updated_at
         FROM actions WHERE name = ?`,
      )
      .bind(name)
      .first<ActionRow>()) ?? null
  );
}

export async function upsertAction(
  db: D1Database,
  input: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    kind: ActionKind;
    config: Record<string, unknown>;
    secretRef?: string | null;
    confirmRequired?: boolean;
    enabled?: boolean;
  },
): Promise<ActionPublic> {
  const err = validateActionName(input.name);
  if (err) throw new Error(err);
  if (input.kind !== "http" && input.kind !== "static" && input.kind !== "mcp") {
    throw new Error("kind must be http, static, or mcp");
  }
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO actions
         (name, description, input_schema, kind, config, secret_ref,
          confirm_required, enabled, use_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(name) DO UPDATE SET
         description = excluded.description,
         input_schema = excluded.input_schema,
         kind = excluded.kind,
         config = excluded.config,
         secret_ref = excluded.secret_ref,
         confirm_required = excluded.confirm_required,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.name,
      input.description.slice(0, 2000),
      JSON.stringify(input.inputSchema || { type: "object", properties: {} }),
      input.kind,
      JSON.stringify(input.config || {}),
      input.secretRef || null,
      input.confirmRequired ? 1 : 0,
      input.enabled === false ? 0 : 1,
      now,
    )
    .run();
  const row = await getAction(db, input.name);
  if (!row) throw new Error("failed to save action");
  return rowToPublic(row);
}

export async function setActionEnabled(
  db: D1Database,
  name: string,
  enabled: boolean,
): Promise<ActionPublic> {
  const now = Date.now();

  if (isReservedActionName(name)) {
    const builtin = BUILTIN_ACTIONS.find((b) => b.name === name);
    if (!builtin) throw new Error("Action not found");
    await db
      .prepare(
        `INSERT INTO actions
           (name, description, input_schema, kind, config, secret_ref,
            confirm_required, enabled, use_count, updated_at)
         VALUES (?, ?, ?, 'builtin', '{}', NULL, 0, ?, 0, ?)
         ON CONFLICT(name) DO UPDATE SET
           enabled = excluded.enabled,
           updated_at = excluded.updated_at,
           description = excluded.description,
           input_schema = excluded.input_schema,
           kind = 'builtin'`,
      )
      .bind(
        name,
        builtin.description,
        JSON.stringify(builtin.inputSchema),
        enabled ? 1 : 0,
        now,
      )
      .run();
    return { ...builtin, enabled, updatedAt: now };
  }

  const row = await getAction(db, name);
  if (!row) throw new Error("Action not found");
  await db
    .prepare(`UPDATE actions SET enabled = ?, updated_at = ? WHERE name = ?`)
    .bind(enabled ? 1 : 0, now, name)
    .run();
  const next = await getAction(db, name);
  if (!next) throw new Error("Action not found");
  return rowToPublic(next);
}

export async function deleteAction(db: D1Database, name: string): Promise<void> {
  if (isReservedActionName(name)) throw new Error("Cannot delete a built-in.");
  await db.prepare(`DELETE FROM actions WHERE name = ?`).bind(name).run();
}

export async function recordActionSuccess(
  db: D1Database,
  name: string,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE actions SET use_count = use_count + 1, last_used_at = ?, last_error = NULL
       WHERE name = ?`,
    )
    .bind(now, name)
    .run();
}

export async function recordActionError(
  db: D1Database,
  name: string,
  error: string,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE actions SET use_count = use_count + 1, last_used_at = ?,
              last_error = ?, last_error_at = ?
       WHERE name = ?`,
    )
    .bind(now, error.slice(0, 1000), now, name)
    .run();
}

/* ─── Secrets (write-only) ─── */

export async function listSecrets(db: D1Database): Promise<SecretPublic[]> {
  const res = await db
    .prepare(`SELECT name, updated_at FROM secrets ORDER BY name`)
    .all<{ name: string; updated_at: number }>();
  return (res.results ?? []).map((r) => ({
    name: r.name,
    updatedAt: r.updated_at,
    hasValue: true as const,
  }));
}

export async function putSecret(
  db: D1Database,
  name: string,
  value: string,
): Promise<SecretPublic> {
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(name)) {
    throw new Error("Secret name must be UPPER_SNAKE_CASE.");
  }
  if (!value) throw new Error("Secret value is required.");
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO secrets (name, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(name, value, now)
    .run();
  return { name, updatedAt: now, hasValue: true };
}

export async function deleteSecret(db: D1Database, name: string): Promise<void> {
  await db.prepare(`DELETE FROM secrets WHERE name = ?`).bind(name).run();
}

export async function readSecret(
  db: D1Database,
  name: string | null | undefined,
): Promise<string | null> {
  if (!name) return null;
  const row = await db
    .prepare(`SELECT value FROM secrets WHERE name = ?`)
    .bind(name)
    .first<{ value: string }>();
  return row?.value ?? null;
}

/* ─── MCP servers ─── */

export async function listMcpServers(db: D1Database): Promise<McpServerPublic[]> {
  const res = await db
    .prepare(
      `SELECT id, name, url, transport, allowed_tools, secret_ref, enabled,
              use_count, last_used_at, last_error, last_error_at, updated_at
       FROM mcp_servers ORDER BY name`,
    )
    .all<McpServerRow>();
  return (res.results ?? []).map(mcpToPublic);
}

export async function getMcpServer(
  db: D1Database,
  id: string,
): Promise<McpServerRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, name, url, transport, allowed_tools, secret_ref, enabled,
                use_count, last_used_at, last_error, last_error_at, updated_at
         FROM mcp_servers WHERE id = ?`,
      )
      .bind(id)
      .first<McpServerRow>()) ?? null
  );
}

export async function upsertMcpServer(
  db: D1Database,
  input: {
    id?: string;
    name: string;
    url: string;
    transport?: "http" | "sse";
    allowedTools: string[];
    secretRef?: string | null;
    enabled?: boolean;
  },
): Promise<McpServerPublic> {
  const id =
    input.id ||
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) ||
    crypto.randomUUID().slice(0, 8);
  if (!input.url.startsWith("https://") && !input.url.startsWith("http://")) {
    throw new Error("MCP URL must be http(s).");
  }
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO mcp_servers
         (id, name, url, transport, allowed_tools, secret_ref, enabled, use_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         url = excluded.url,
         transport = excluded.transport,
         allowed_tools = excluded.allowed_tools,
         secret_ref = excluded.secret_ref,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      input.name.slice(0, 120),
      input.url,
      input.transport === "sse" ? "sse" : "http",
      JSON.stringify(input.allowedTools || []),
      input.secretRef || null,
      input.enabled === false ? 0 : 1,
      now,
    )
    .run();
  const row = await getMcpServer(db, id);
  if (!row) throw new Error("failed to save MCP server");
  return mcpToPublic(row);
}

export async function deleteMcpServer(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM mcp_servers WHERE id = ?`).bind(id).run();
}

async function recordMcpSuccess(db: D1Database, id: string): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE mcp_servers SET use_count = use_count + 1, last_used_at = ?, last_error = NULL
       WHERE id = ?`,
    )
    .bind(now, id)
    .run();
}

async function recordMcpError(
  db: D1Database,
  id: string,
  error: string,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE mcp_servers SET use_count = use_count + 1, last_used_at = ?,
              last_error = ?, last_error_at = ?
       WHERE id = ?`,
    )
    .bind(now, error.slice(0, 1000), now, id)
    .run();
}

/* ─── Tool defs for the LLM ─── */

export async function customToolsForTurn(db: D1Database): Promise<unknown[]> {
  const rows = await listActionRows(db);
  return rows
    .filter((r) => r.enabled === 1)
    .map((r) => ({
      name: r.name,
      description:
        r.confirm_required === 1
          ? `${r.description} Confirm with the visitor before calling.`
          : r.description,
      input_schema: parseJsonObject(r.input_schema, {
        type: "object",
        properties: {},
      }),
    }));
}

/* ─── Executors ─── */

function interpolate(template: string, input: Record<string, unknown>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const v = input[key];
      return v == null ? "" : encodeURIComponent(String(v));
    })
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = input[key];
      return v == null ? "" : encodeURIComponent(String(v));
    });
}

function interpolatePlain(template: string, input: Record<string, unknown>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const v = input[key];
      return v == null ? "" : String(v);
    })
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = input[key];
      return v == null ? "" : String(v);
    });
}

async function mcpJsonRpc(
  url: string,
  method: string,
  params: Record<string, unknown>,
  bearer: string | null,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
  });
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    const dataLines = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    const last = dataLines.at(-1);
    if (!last) throw new Error("MCP SSE empty");
    const parsed = JSON.parse(last) as { result?: unknown; error?: { message?: string } };
    if (parsed.error) throw new Error(parsed.error.message || "MCP error");
    return parsed.result;
  }
  const parsed = (await res.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (parsed.error) throw new Error(parsed.error.message || "MCP error");
  return parsed.result;
}

export async function executeCustomAction(opts: {
  db: D1Database;
  name: string;
  input: unknown;
  preview?: boolean;
}): Promise<string> {
  const row = await getAction(opts.db, opts.name);
  if (!row) return `Unknown action: ${opts.name}`;
  if (row.enabled !== 1) return `Action ${opts.name} is disabled.`;

  const inputObj =
    opts.input && typeof opts.input === "object" && !Array.isArray(opts.input)
      ? (opts.input as Record<string, unknown>)
      : {};
  const config = parseJsonObject(row.config);

  try {
    let result: string;
    switch (row.kind as ActionKind) {
      case "static": {
        const message =
          typeof config.message === "string"
            ? interpolatePlain(config.message, inputObj)
            : "Action completed.";
        result = message.slice(0, 4000);
        break;
      }
      case "http": {
        const rawUrl = typeof config.url === "string" ? config.url : "";
        const url = interpolate(rawUrl, inputObj);
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
          throw new Error("HTTP action needs a valid url in config.");
        }
        const method =
          typeof config.method === "string"
            ? config.method.toUpperCase()
            : "POST";
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (config.headers && typeof config.headers === "object") {
          for (const [k, v] of Object.entries(
            config.headers as Record<string, unknown>,
          )) {
            if (typeof v === "string") headers[k] = v;
          }
        }
        const auth =
          typeof config.auth === "string" ? config.auth : "bearer";
        const secret = await readSecret(opts.db, row.secret_ref);
        if (auth === "bearer" && secret) {
          headers.authorization = `Bearer ${secret}`;
        } else if (auth === "header" && secret && typeof config.authHeader === "string") {
          headers[config.authHeader] = secret;
        }
        const timeoutMs =
          typeof config.timeoutMs === "number" ? config.timeoutMs : 8000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const started = Date.now();
        try {
          const res = await fetch(url, {
            method,
            headers,
            body:
              method === "GET" || method === "HEAD"
                ? undefined
                : JSON.stringify({
                    action: row.name,
                    input: inputObj,
                    preview: Boolean(opts.preview),
                  }),
            signal: controller.signal,
          });
          const text = (await res.text()).slice(0, 4000);
          const ms = Date.now() - started;
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} · ${ms}ms · ${text.slice(0, 300)}`);
          }
          result =
            opts.preview
              ? `test run · ${res.status} OK · ${ms} ms · ${text || "(empty)"}`
              : text ||
                `HTTP ${res.status} OK. Tell the visitor the action completed.`;
        } finally {
          clearTimeout(timer);
        }
        break;
      }
      case "mcp": {
        const serverId = typeof config.serverId === "string" ? config.serverId : "";
        const tool = typeof config.tool === "string" ? config.tool : "";
        if (!serverId || !tool) {
          throw new Error("MCP action needs config.serverId and config.tool.");
        }
        const server = await getMcpServer(opts.db, serverId);
        if (!server || server.enabled !== 1) {
          throw new Error(`MCP server ${serverId} missing or disabled.`);
        }
        const allow = parseStringArray(server.allowed_tools);
        if (allow.length > 0 && !allow.includes(tool)) {
          throw new Error(`Tool ${tool} is not on the MCP allowlist.`);
        }
        const bearer = await readSecret(opts.db, server.secret_ref || row.secret_ref);
        try {
          const mcpResult = await mcpJsonRpc(
            server.url,
            "tools/call",
            { name: tool, arguments: inputObj },
            bearer,
          );
          await recordMcpSuccess(opts.db, server.id);
          result =
            typeof mcpResult === "string"
              ? mcpResult.slice(0, 4000)
              : JSON.stringify(mcpResult).slice(0, 4000);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await recordMcpError(opts.db, server.id, msg);
          throw e;
        }
        break;
      }
      default: {
        const _exhaustive: never = row.kind as never;
        void _exhaustive;
        throw new Error(`Unsupported kind: ${row.kind}`);
      }
    }
    await recordActionSuccess(opts.db, row.name);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordActionError(opts.db, row.name, msg);
    return `Action failed: ${msg}`;
  }
}

export async function testAction(opts: {
  db: D1Database;
  name: string;
  input?: unknown;
}): Promise<{ ok: boolean; result: string }> {
  if (isReservedActionName(opts.name)) {
    return {
      ok: false,
      result: "Built-ins are exercised via Playground, not test-run.",
    };
  }
  const result = await executeCustomAction({
    db: opts.db,
    name: opts.name,
    input: opts.input ?? {},
    preview: true,
  });
  const ok = !result.startsWith("Action failed:");
  return { ok, result };
}

export async function listMcpTools(
  db: D1Database,
  serverId: string,
): Promise<{ tools: Array<{ name: string; description?: string }>; error?: string }> {
  const server = await getMcpServer(db, serverId);
  if (!server) return { tools: [], error: "Server not found" };
  try {
    const bearer = await readSecret(db, server.secret_ref);
    const result = (await mcpJsonRpc(
      server.url,
      "tools/list",
      {},
      bearer,
    )) as { tools?: Array<{ name: string; description?: string }> };
    const tools = result.tools ?? [];
    const allow = parseStringArray(server.allowed_tools);
    return {
      tools:
        allow.length === 0
          ? tools
          : tools.filter((t) => allow.includes(t.name)),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordMcpError(db, server.id, msg);
    return { tools: [], error: msg };
  }
}
