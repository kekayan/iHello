import WebSocket from "ws";
import { randomUUID } from "crypto";

async function chat(query) {
  const cid = randomUUID();
  const url = `wss://site-chat-agent.kekayanlabs.workers.dev/agents/chat-agent/${cid}`;
  const outs = [];
  const ws = new WebSocket(url, {
    headers: { "Cf-Access-Jwt-Assertion": "bench-bypass" },
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("open timeout")), 10000);
    ws.once("open", () => { clearTimeout(t); resolve(); });
    ws.once("error", reject);
  });

  const id = randomUUID();
  const body = {
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
  };
  ws.send(
    JSON.stringify({
      type: "cf_agent_use_chat_request",
      id,
      init: {
        method: "POST",
        body: JSON.stringify(body),
      },
    }),
  );

  const deadline = Date.now() + 25000;
  let done = false;
  while (!done && Date.now() < deadline) {
    const msg = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000);
      ws.once("message", (data) => {
        clearTimeout(timer);
        resolve(data.toString());
      });
    });
    if (msg == null) break;
    let parsed;
    try { parsed = JSON.parse(msg); } catch { outs.push({ raw: msg.slice(0, 400) }); continue; }
    outs.push(parsed);
    if (parsed.type === "cf_agent_use_chat_response") {
      if (parsed.done || parsed.error) done = true;
      const b = String(parsed.body || "");
      if (b.includes('"type":"error"') || b === "An error occurred.") done = true;
    }
  }
  try { ws.close(); } catch {}
  return outs;
}

for (const q of ["Spin up a delivery pod", "What do you offer for cloud migration?"]) {
  console.log("=== QUERY:", q);
  try {
    const outs = await chat(q);
    for (const o of outs) {
      const s = JSON.stringify(o);
      console.log(s.length > 900 ? s.slice(0, 900) + "…" : s);
    }
  } catch (e) {
    console.error("FAIL", e);
  }
  console.log();
}
