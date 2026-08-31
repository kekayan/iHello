/**
 * Persona harness — run against `wrangler dev` with local D1 migrated.
 * Usage: npm run test:personas
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scenarios } from "./personas.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.IHELLO_BASE || "http://127.0.0.1:8787";
const WS_BASE = BASE.replace(/^http/, "ws");

function uuid(): string {
  return crypto.randomUUID();
}

async function playScenario(
  name: string,
  turns: string[],
): Promise<{ replies: string[]; convId: string }> {
  const convId = `preview_${uuid()}`;
  const replies: string[] = [];
  let current = "";

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/agents/chat-agent/${convId}?preview=1`);
    let turnIndex = 0;
    let settled = false;

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          t: "hello",
          visitor_id: uuid(),
          page_url: "https://example.com/",
          referrer: "",
          turnstile_token: "",
        }),
      );
    });

    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as {
        t: string;
        text?: string;
        code?: string;
      };
      if (msg.t === "ready") {
        sendNext();
      } else if (msg.t === "delta") {
        current += msg.text || "";
      } else if (msg.t === "done") {
        replies.push(current);
        current = "";
        turnIndex += 1;
        if (turnIndex >= turns.length) {
          settled = true;
          ws.close();
          resolve();
        } else {
          sendNext();
        }
      } else if (msg.t === "refuse" || msg.t === "err") {
        replies.push(`[${msg.t}:${msg.code || ""}]${current}`);
        current = "";
        turnIndex += 1;
        if (turnIndex >= turns.length) {
          settled = true;
          ws.close();
          resolve();
        } else {
          sendNext();
        }
      }
    });

    ws.addEventListener("error", (e) => fail(e));

    function sendNext() {
      const text = turns[turnIndex];
      if (!text) return;
      ws.send(JSON.stringify({ t: "msg", text, source: "typed" }));
    }

    setTimeout(() => fail(new Error(`timeout: ${name}`)), 180_000);
  });

  return { replies, convId };
}

function d1Query(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["wrangler", "d1", "execute", "chat_agent", "--local", "--command", sql, "--json"],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("close", (code: number | null) => {
      if (code !== 0) reject(new Error(err || out || `d1 exit ${code}`));
      else resolve(out);
    });
  });
}

async function handoffRows(
  convId: string,
): Promise<Array<{ type: string; email: string }>> {
  const out = await d1Query(
    `SELECT type, email FROM handoffs WHERE conversation_id = '${convId}'`,
  );
  try {
    const parsed = JSON.parse(out) as Array<{
      results?: Array<{ type: string; email: string }>;
    }>;
    const block = Array.isArray(parsed) ? parsed[0] : parsed;
    return (
      (block as { results?: Array<{ type: string; email: string }> })?.results ?? []
    );
  } catch {
    return [];
  }
}

function includesLoose(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

async function main() {
  const results: Array<{ name: string; pass: boolean; detail: string }> = [];

  for (const s of scenarios) {
    try {
      const { replies, convId } = await playScenario(s.name, s.turns);
      const joined = replies.join("\n");
      const hands = await handoffRows(convId);
      const fails: string[] = [];

      if (s.assert.handoffType) {
        if (!hands.some((h) => h.type === s.assert.handoffType)) {
          fails.push(
            `expected handoff type ${s.assert.handoffType}, got ${JSON.stringify(hands)}`,
          );
        }
      }
      if (s.assert.handoffAbsent && hands.length > 0) {
        fails.push(`expected no handoff, got ${hands.length}`);
      }
      if (s.assert.exactlyOneHandoff && hands.length !== 1) {
        fails.push(`expected exactly one handoff, got ${hands.length}`);
      }
      for (const m of s.assert.mustInclude || []) {
        if (!includesLoose(joined, m)) fails.push(`missing: ${m}`);
      }
      for (const m of s.assert.mustExclude || []) {
        if (m === "MVP") {
          const withoutQuotes = joined
            .replace(/"[^"]*MVP[^"]*"/gi, "")
            .replace(/'[^']*MVP[^']*'/gi, "");
          if (withoutQuotes.includes("MVP")) fails.push(`excluded term present: MVP`);
        } else if (includesLoose(joined, m)) {
          fails.push(`excluded term present: ${m}`);
        }
      }

      results.push({
        name: s.name,
        pass: fails.length === 0,
        detail: fails.join("; ") || "ok",
      });
    } catch (err) {
      results.push({
        name: s.name,
        pass: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("\nPersona results");
  console.log("---------------");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  process.exit(failed === 0 ? 0 : 1);
}

main();
