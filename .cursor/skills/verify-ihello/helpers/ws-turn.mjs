/**
 * Drive iHello ChatAgent over the Agents SDK WS protocol.
 * Usage:
 *   node helpers/ws-turn.mjs --query "..." [--out evidence.json]
 *   node helpers/ws-turn.mjs --turns '["q1","q2"]' --out evidence.json
 * Flags:
 *   --trace            append ?trace=1 and body.trace so data-turn-trace streams
 * Env:
 *   IHELLO_WS_BASE     default wss://site-chat-agent.kekayanlabs.workers.dev
 *   IHELLO_ACCESS      default bench-bypass (Cf-Access-Jwt-Assertion)
 *   IHELLO_PAGE_URL    default https://hello.kekayan.com/
 *   IHELLO_TIMEOUT_MS  default 60000
 *   IHELLO_TRACE       set to 1 for same as --trace
 */
import WebSocket from "ws";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const WS_BASE = (
  process.env.IHELLO_WS_BASE ||
  "wss://site-chat-agent.kekayanlabs.workers.dev"
).replace(/\/$/, "");
const ACCESS = process.env.IHELLO_ACCESS || "bench-bypass";
const PAGE_URL = process.env.IHELLO_PAGE_URL || "https://hello.kekayan.com/";
const outPath = arg("--out", "");
const single = arg("--query", "");
let turns = [];
if (single) turns = [single];
else if (arg("--turns", "")) {
  turns = JSON.parse(arg("--turns", "[]"));
}
if (!turns.length) {
  console.error("Pass --query or --turns JSON array");
  process.exit(2);
}

const TRACE =
  process.argv.includes("--trace") ||
  process.env.IHELLO_TRACE === "1" ||
  process.env.IHELLO_TRACE === "true";
const convId = `verify_${randomUUID()}`;
const url = `${WS_BASE}/agents/chat-agent/${convId}${TRACE ? "?trace=1" : ""}`;
const timeoutMs = Number(process.env.IHELLO_TIMEOUT_MS || 60000);

function openWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: { "Cf-Access-Jwt-Assertion": ACCESS },
    });
    const t = setTimeout(() => reject(new Error("open timeout")), 15000);
    ws.once("open", () => {
      clearTimeout(t);
      resolve(ws);
    });
    ws.once("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function oneTurn(ws, query) {
  const events = [];
  let text = "";
  let followUps = null;
  let error = null;
  let done = false;
  const tools = [];

  let turnTrace = null;
  ws.send(
    JSON.stringify({
      type: "cf_agent_use_chat_request",
      id: randomUUID(),
      init: {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              id: randomUUID(),
              role: "user",
              parts: [{ type: "text", text: query }],
            },
          ],
          visitor_id: randomUUID(),
          page_url: PAGE_URL,
          referrer: "",
          turnstile_token: "",
          source: "typed",
          ...(TRACE ? { trace: true, debug: true } : {}),
        }),
      },
    }),
  );

  const deadline = Date.now() + timeoutMs;
  while (!done && Date.now() < deadline) {
    const raw = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 10000);
      ws.once("message", (data) => {
        clearTimeout(timer);
        resolve(data.toString());
      });
    });
    if (raw == null) break;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (parsed.type !== "cf_agent_use_chat_response") continue;
    if (parsed.error) {
      error = true;
      events.push({ error: true });
      done = true;
      break;
    }
    let body = null;
    try {
      body =
        typeof parsed.body === "string" ? JSON.parse(parsed.body) : parsed.body;
    } catch {
      body = null;
    }
    if (body?.type === "text-delta" && body.delta) text += body.delta;
    if (body?.type === "text" && body.text) text += body.text;
    if (
      body?.type === "tool-input-start" ||
      body?.type === "tool-input-available"
    ) {
      tools.push(body.toolName || body.type);
      events.push({ type: body.type, tool: body.toolName });
    }
    if (body?.type === "data-activity") {
      events.push({ type: "data-activity", label: body.data?.label });
    }
    if (body?.type === "data-follow-ups") {
      followUps = body.data?.suggestions ?? body.data;
      events.push({ type: "data-follow-ups", suggestions: followUps });
    }
    if (body?.type === "data-turn-trace") {
      turnTrace = body.data ?? null;
      events.push({ type: "data-turn-trace", data: turnTrace });
    }
    if (parsed.done) done = true;
  }

  return {
    query,
    done,
    error: !!error,
    text,
    followUps,
    tools,
    events,
    turnTrace,
  };
}

const ws = await openWs();
const results = [];
try {
  for (const q of turns) {
    results.push(await oneTurn(ws, q));
  }
} finally {
  try {
    ws.close();
  } catch {}
}

const evidence = {
  at: new Date().toISOString(),
  wsBase: WS_BASE,
  convId,
  pageUrl: PAGE_URL,
  turns: results,
};
const summary = {
  ok: results.every((r) => r.done && !r.error && r.text.trim().length > 0),
  convId,
  texts: results.map((r) => r.text.slice(0, 120)),
  followUps: results.map((r) => r.followUps),
  errors: results.map((r) => r.error),
  done: results.map((r) => r.done),
  traces: results.map((r) =>
    r.turnTrace
      ? {
          total_ms: r.turnTrace.total_ms,
          ttft_ms: r.turnTrace.ttft_ms,
          retrieve_ms: r.turnTrace.retrieve_ms,
          intent: r.turnTrace.intent,
          generate: (r.turnTrace.generate || []).map((g) => ({
            pass: g.pass,
            duration_ms: g.duration_ms,
            tool_names: g.tool_names,
          })),
        }
      : null,
  ),
};
console.log(JSON.stringify({ summary, evidence }, null, 2));
if (TRACE) {
  for (const [i, t] of summary.traces.entries()) {
    console.error(
      `span-summary turn[${i}]`,
      t ? JSON.stringify(t) : "(no data-turn-trace — check wrangler tail for turn-trace log)",
    );
  }
}

if (outPath) {
  mkdirSync(dirname(outPath) || ".", { recursive: true });
  writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.error("wrote", outPath);
}

process.exit(summary.ok ? 0 : 1);
