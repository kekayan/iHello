(() => {
  const REFUSE = {
    turnstile: "Verification failed — reload the page.",
    rate: "One moment — try again shortly.",
    busy: "One moment — try again shortly.",
    too_long: "That message is too long.",
    too_many:
      "This conversation has reached its limit — leave your email via the last reply and we'll follow up.",
    disabled: "",
  };

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getOrCreate(key) {
    let v = localStorage.getItem(key);
    if (!v) {
      v = uuid();
      localStorage.setItem(key, v);
    }
    return v;
  }

  const host = document.currentScript?.src
    ? new URL(document.currentScript.src).origin
    : location.origin;

  const root = document.createElement("div");
  root.id = "ihello-root";
  document.documentElement.appendChild(root);
  const shadow = root.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host, * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .launcher {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
      background: #1a1a1a; color: #fff; font-size: 22px; box-shadow: 0 8px 24px rgba(0,0,0,.2);
    }
    .panel {
      position: fixed; right: 20px; bottom: 88px; z-index: 2147483000;
      width: min(380px, calc(100vw - 32px)); height: min(560px, calc(100vh - 120px));
      background: #fff; color: #1a1a1a; border: 1px solid #e6e6e6; border-radius: 16px;
      display: none; flex-direction: column; overflow: hidden;
      box-shadow: 0 16px 48px rgba(0,0,0,.18);
    }
    .panel.open { display: flex; }
    .header { padding: 14px 16px; border-bottom: 1px solid #eee; font-weight: 600; }
    .msgs { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .bubble { max-width: 90%; padding: 10px 12px; border-radius: 12px; line-height: 1.4; font-size: 14px; white-space: pre-wrap; }
    .user { align-self: flex-end; background: #1a1a1a; color: #fff; }
    .assistant { align-self: flex-start; background: #f2f1ec; color: #1a1a1a; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 8px; }
    .chip { border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 6px 10px; font-size: 12px; cursor: pointer; }
    .composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #eee; }
    .composer input { flex: 1; border: 1px solid #ddd; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
    .composer button { border: none; background: #1a1a1a; color: #fff; border-radius: 10px; padding: 0 14px; cursor: pointer; }
    .fb { margin-top: 6px; display: flex; gap: 6px; }
    .fb button { border: none; background: transparent; cursor: pointer; font-size: 14px; opacity: .7; }
    .sys { font-size: 12px; color: #666; align-self: center; }
  `;
  shadow.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="header">iHello</div>
    <div class="msgs"></div>
    <div class="chips"></div>
    <div class="composer">
      <input type="text" placeholder="Ask a question…" />
      <button type="button">Send</button>
    </div>
  `;
  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.textContent = "💬";
  shadow.appendChild(panel);
  shadow.appendChild(launcher);

  const msgsEl = panel.querySelector(".msgs");
  const chipsEl = panel.querySelector(".chips");
  const inputEl = panel.querySelector("input");
  const sendBtn = panel.querySelector(".composer button");

  let open = false;
  let ws = null;
  let reconnectAttempt = 0;
  let busy = false;
  let currentAssistant = null;
  let turnstileToken = "";
  let config = {
    enabled: true,
    greeting: "",
    suggestions: [],
    placeholder: "Ask a question…",
    autoOpenSeconds: 0,
    turnstileSiteKey: "",
  };

  const convId = getOrCreate("cw_conv");
  const visitorId = getOrCreate("cw_visitor");

  function addBubble(role, text) {
    const el = document.createElement("div");
    el.className = `bubble ${role}`;
    el.textContent = text;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  function addSystem(text) {
    const el = document.createElement("div");
    el.className = "sys";
    el.textContent = text;
    msgsEl.appendChild(el);
  }

  function setOpen(v) {
    open = v;
    panel.classList.toggle("open", open);
  }

  launcher.addEventListener("click", () => setOpen(!open));

  function renderChips(list) {
    chipsEl.innerHTML = "";
    for (const label of list || []) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = label;
      b.addEventListener("click", () => {
        chipsEl.innerHTML = "";
        sendMessage(label, "chip");
      });
      chipsEl.appendChild(b);
    }
  }

  function attachFeedback(bubble, index) {
    const row = document.createElement("div");
    row.className = "fb";
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "👍";
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "👎";
    const sendFb = (rating) => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ t: "feedback", message_index: index, rating }));
      }
      row.remove();
    };
    up.addEventListener("click", () => sendFb("up"));
    down.addEventListener("click", () => sendFb("down"));
    row.appendChild(up);
    row.appendChild(down);
    bubble.appendChild(row);
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const base = host.replace(/^https?/, proto);
    ws = new WebSocket(`${base}/agents/chat-agent/${convId}`);
    ws.addEventListener("open", () => {
      reconnectAttempt = 0;
      ws.send(
        JSON.stringify({
          t: "hello",
          visitor_id: visitorId,
          page_url: location.href,
          referrer: document.referrer || "",
          turnstile_token: turnstileToken,
        }),
      );
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === "ready") {
        if (Array.isArray(msg.history)) {
          for (const h of msg.history) addBubble(h.role, h.content);
        }
        if (config.greeting && (!msg.history || msg.history.length === 0)) {
          addBubble("assistant", config.greeting);
        }
      } else if (msg.t === "delta") {
        if (!currentAssistant) currentAssistant = addBubble("assistant", "");
        currentAssistant.textContent += msg.text;
        msgsEl.scrollTop = msgsEl.scrollHeight;
      } else if (msg.t === "done") {
        busy = false;
        if (currentAssistant) {
          attachFeedback(currentAssistant, Date.now());
        }
        currentAssistant = null;
      } else if (msg.t === "refuse") {
        busy = false;
        currentAssistant = null;
        if (msg.code === "disabled") {
          root.remove();
          return;
        }
        addSystem(REFUSE[msg.code] || "Please try again.");
      } else if (msg.t === "err") {
        busy = false;
        currentAssistant = null;
        addSystem("Something went wrong — please retry.");
      }
    });
    ws.addEventListener("close", () => {
      const delays = [1000, 2000, 4000];
      if (reconnectAttempt >= delays.length) return;
      const delay = delays[reconnectAttempt++];
      setTimeout(connect, delay);
    });
  }

  function sendMessage(text, source) {
    const t = (text || "").trim();
    if (!t || busy) return;
    busy = true;
    addBubble("user", t);
    inputEl.value = "";
    currentAssistant = addBubble("assistant", "");
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ t: "msg", text: t, source }));
    } else {
      busy = false;
      addSystem("Connecting — try again shortly.");
    }
  }

  sendBtn.addEventListener("click", () => sendMessage(inputEl.value, "typed"));
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage(inputEl.value, "typed");
  });

  async function boot() {
    try {
      const res = await fetch(`${host}/config?page=${encodeURIComponent(location.href)}`);
      config = await res.json();
    } catch {
      config = { enabled: true, greeting: "Kia ora", suggestions: [], placeholder: "Ask a question…", autoOpenSeconds: 0, turnstileSiteKey: "" };
    }
    if (config.enabled === false) {
      root.remove();
      return;
    }
    inputEl.placeholder = config.placeholder || "Ask a question…";
    renderChips(config.suggestions || []);
    if (config.turnstileSiteKey && config.turnstileSiteKey !== "REPLACE") {
      await loadTurnstile(config.turnstileSiteKey);
    }
    connect();
    if (config.autoOpenSeconds > 0 && !localStorage.getItem("cw_auto")) {
      setTimeout(() => {
        localStorage.setItem("cw_auto", "1");
        setOpen(true);
      }, config.autoOpenSeconds * 1000);
    }
  }

  function loadTurnstile(siteKey) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => {
        const holder = document.createElement("div");
        holder.style.display = "none";
        shadow.appendChild(holder);
        window.turnstile.render(holder, {
          sitekey: siteKey,
          size: "invisible",
          callback: (token) => {
            turnstileToken = token;
            resolve();
          },
          "error-callback": () => resolve(),
        });
        // Invisible widgets often need execute
        try {
          window.turnstile.execute(holder);
        } catch {
          resolve();
        }
      };
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }

  boot();
})();
