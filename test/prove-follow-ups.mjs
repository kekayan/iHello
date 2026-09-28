import WebSocket from "ws";
import { randomUUID } from "crypto";

async function chat(query, timeoutMs = 45000) {
  const cid = randomUUID();
  const url = `wss://site-chat-agent.kekayanlabs.workers.dev/agents/chat-agent/${cid}`;
  const events = [];
  const ws = new WebSocket(url, {
    headers: { "Cf-Access-Jwt-Assertion": "bench-bypass" },
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("open timeout")), 10000);
    ws.once("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.once("error", reject);
  });

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
          page_url: "https://example.com/",
          referrer: "",
        }),
      },
    }),
  );

  const deadline = Date.now() + timeoutMs;
  let done = false;
  let text = "";
  let followUps = null;
  while (!done && Date.now() < deadline) {
    const msg = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 8000);
      ws.once("message", (data) => {
        clearTimeout(timer);
        resolve(data.toString());
      });
    });
    if (msg == null) break;
    let parsed;
    try {
      parsed = JSON.parse(msg);
    } catch {
      continue;
    }
    if (parsed.type !== "cf_agent_use_chat_response") continue;
    if (parsed.error) {
      events.push({ error: parsed.error });
      done = true;
      break;
    }
    let body = null;
    try {
      body = typeof parsed.body === "string" ? JSON.parse(parsed.body) : parsed.body;
    } catch {
      body = { raw: String(parsed.body).slice(0, 200) };
    }
    if (body?.type === "text-delta" && body.delta) text += body.delta;
    if (body?.type === "text" && body.text) text += body.text;
    if (body?.type === "data-follow-ups") {
      followUps = body.data?.suggestions ?? body.data;
      events.push({ type: "data-follow-ups", data: body.data });
    }
    if (body?.type === "data-activity") {
      events.push({ type: "data-activity", label: body.data?.label });
    }
    if (parsed.done) done = true;
  }
  try {
    ws.close();
  } catch {}
  return { text: text.slice(0, 400), followUps, events, done };
}

const cases = [
  ["migration FAQ", "What do you offer for cloud migration?"],
  ["declined python", "Write a python function that sorts a list of numbers"],
];

for (const [label, q] of cases) {
  console.log("===", label, ":", q);
  try {
    const r = await chat(q);
    console.log("done:", r.done);
    console.log("text:", r.text.replace(/\n/g, " ").slice(0, 280));
    console.log("followUps:", JSON.stringify(r.followUps));
    console.log(
      "events:",
      r.events.filter((e) => e.type === "data-follow-ups" || e.error),
    );
  } catch (e) {
    console.error("FAIL", e);
  }
  console.log();
}
