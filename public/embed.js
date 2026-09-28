(() => {
  const REFUSE = {
    turnstile: "Verification failed - reload the page.",
    rate: "One moment - try again shortly.",
    busy: "One moment - try again shortly.",
    too_long: "That message is too long.",
    too_many:
      "This conversation has reached its limit - leave your email via the last reply and we'll follow up.",
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
    @import url("https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap");

    :host, * { box-sizing: border-box; }
    :host {
      --ink: #0c1418;
      --ink-2: #3d4a52;
      --muted: #8b969e;
      --paper: #ffffff;
      --wash: #f3f5f7;
      --bot: #e8ecef;
      --line: rgba(12, 20, 24, 0.1);
      --accent: #c41230;
      --accent-ink: #fff;
      font-family: "Outfit", system-ui, -apple-system, sans-serif;
      color: var(--ink);
      -webkit-font-smoothing: antialiased;
    }

    .launcher {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
      background: var(--accent); color: var(--accent-ink);
      display: grid; place-items: center;
      box-shadow: 0 10px 28px rgba(196, 18, 48, 0.35);
      transition: transform .2s ease, box-shadow .2s ease;
    }
    .launcher:hover { transform: translateY(-1px) scale(1.03); }
    .launcher:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
    .launcher svg { width: 22px; height: 22px; }

    .panel {
      position: fixed; right: 20px; bottom: 88px; z-index: 2147483000;
      width: min(400px, calc(100vw - 28px));
      height: min(620px, calc(100vh - 112px));
      background: var(--wash);
      border-radius: 22px;
      display: none; flex-direction: column; overflow: hidden;
      box-shadow: 0 22px 60px rgba(12, 20, 24, 0.28);
      transform-origin: bottom right;
      animation: pop .22s ease;
    }
    .panel.open { display: flex; }
    @keyframes pop {
      from { opacity: 0; transform: translateY(10px) scale(.96); }
      to { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .panel { animation: none; }
      .launcher { transition: none; }
      .row.enter { animation: none; }
      .activity-dot { animation: none !important; opacity: 0.7; }
      .activity-label { animation: none !important; color: #5c6670; -webkit-text-fill-color: #5c6670; background: none; }
      .stream-caret { animation: none !important; }
      .chip { transition: none; }
    }

    .header {
      flex: 0 0 auto;
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; padding: 14px 14px 14px 16px;
      background: linear-gradient(180deg, #121c20 0%, #0c1418 100%);
      color: #fff;
    }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .mark {
      width: 30px; height: 30px; border-radius: 999px; flex: 0 0 auto;
      background:
        radial-gradient(circle at 35% 35%, #ff5a6e 0 28%, transparent 30%),
        conic-gradient(from 210deg, #c41230, #1a1a1a 45%, #c41230 70%, #fff 100%);
      box-shadow: inset 0 0 0 2px rgba(255,255,255,.12);
    }
    .brand-name { font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }
    .hdr-actions { display: flex; align-items: center; gap: 2px; }
    .icon-btn {
      width: 36px; height: 36px; border: none; border-radius: 10px;
      background: transparent; color: rgba(255,255,255,.88); cursor: pointer;
      display: grid; place-items: center;
    }
    .icon-btn:hover { background: rgba(255,255,255,.08); color: #fff; }
    .icon-btn svg { width: 18px; height: 18px; }

    .menu-wrap { position: relative; }
    .menu {
      position: absolute; top: calc(100% + 6px); right: 0; z-index: 5;
      min-width: 200px; padding: 6px;
      background: var(--paper); color: var(--ink);
      border: 1px solid var(--line); border-radius: 14px;
      box-shadow: 0 14px 36px rgba(12,20,24,.18);
      display: none;
    }
    .menu.open { display: block; }
    .menu button {
      width: 100%; display: flex; align-items: center; gap: 10px;
      border: none; background: transparent; cursor: pointer;
      padding: 10px 12px; border-radius: 10px;
      font: inherit; font-size: 14px; font-weight: 500; text-align: left; color: var(--ink);
    }
    .menu button:hover { background: var(--wash); }
    .menu button svg { width: 16px; height: 16px; opacity: .75; }

    .body {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .msgs {
      flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px 14px 8px;
      display: flex; flex-direction: column; gap: 12px;
      scroll-behavior: smooth;
    }
    .msgs.has-chips { padding-bottom: 120px; }
    .row { display: flex; flex-direction: column; gap: 6px; max-width: 92%; }
    .row.user { align-self: flex-end; align-items: flex-end; }
    .row.assistant { align-self: flex-start; align-items: flex-start; }
    .bubble {
      padding: 11px 14px; border-radius: 18px; line-height: 1.45;
      font-size: 14.5px; font-weight: 400; word-break: break-word;
    }
    .row.user .bubble {
      background: var(--ink); color: #fff;
      border-bottom-right-radius: 8px;
      white-space: pre-wrap;
    }
    .row.assistant .bubble {
      background: var(--bot); color: var(--ink);
      border-bottom-left-radius: 8px;
    }
    .row.assistant .bubble.md p { margin: 0; }
    .row.assistant .bubble.md p + p { margin-top: 0.55em; }
    .row.assistant .bubble.md ul,
    .row.assistant .bubble.md ol {
      margin: 0.45em 0; padding-left: 1.2em;
    }
    .row.assistant .bubble.md li { margin: 0.2em 0; }
    .row.assistant .bubble.md strong { font-weight: 600; }
    .row.assistant .bubble.md a {
      color: inherit; text-decoration: underline; text-underline-offset: 2px;
    }
    .row.assistant .bubble.md code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.9em; background: rgba(12,20,24,.08);
      padding: 0.1em 0.35em; border-radius: 5px;
    }
    .row.assistant .bubble.md pre {
      margin: 0.5em 0; padding: 0.65em 0.75em; border-radius: 10px;
      background: rgba(12,20,24,.08); overflow-x: auto;
    }
    .row.assistant .bubble.md pre code {
      background: none; padding: 0; font-size: 0.86em;
    }
    .row.assistant .bubble.md h1,
    .row.assistant .bubble.md h2,
    .row.assistant .bubble.md h3 {
      margin: 0.35em 0 0.25em; font-size: 1em; font-weight: 600;
    }
    .row.enter {
      animation: pop .22s ease;
    }
    .row.assistant .bubble.md .activity {
      display: inline-flex; align-items: center; gap: 8px;
      margin: 0; color: #5c6670; font-style: normal;
    }
    .activity-orb {
      position: relative; width: 18px; height: 18px; flex: none;
      color: #5c6670;
    }
    .activity-ring { position: absolute; inset: 0; }
    .activity-dot {
      position: absolute; left: 50%; top: 50%;
      width: 3px; height: 3px; margin: -1.5px 0 0 -1.5px;
      border-radius: 50%; background: currentColor; opacity: 0.22;
      transform: rotate(calc(var(--i) * 45deg)) translateY(-6.5px);
      animation: activity-chase 1.2s linear infinite;
      animation-delay: calc(var(--i) * -0.15s);
    }
    @keyframes activity-chase {
      0%, 12% { opacity: 1; }
      13%, 100% { opacity: 0.22; }
    }
    .activity-label {
      font-size: 13.5px; font-weight: 500; line-height: 1.35;
      color: transparent; -webkit-text-fill-color: transparent;
      background: linear-gradient(
        90deg,
        #5c6670 0%, #5c6670 30%,
        rgba(92, 102, 112, 0.4) 45%, rgba(92, 102, 112, 0.4) 55%,
        #5c6670 70%, #5c6670 100%
      );
      background-size: 300% 100%;
      -webkit-background-clip: text; background-clip: text;
      animation: label-shine 2.25s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
    }
    @keyframes label-shine {
      0%, 18% { background-position: 100% 0; }
      82%, 100% { background-position: 0% 0; }
    }
    .stream-caret {
      display: inline-block; width: 7px; height: 1.05em;
      margin-left: 2px; background: var(--ink);
      vertical-align: text-bottom; border-radius: 1px;
    }
    .stream-caret.blink {
      animation: caret-blink 1s step-end infinite;
    }
    @keyframes caret-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    .meta {
      display: flex; align-items: center; gap: 8px;
      padding: 0 4px; font-size: 11px; color: var(--muted);
    }
    .fb { display: flex; gap: 2px; }
    .fb button {
      width: 26px; height: 26px; border: none; border-radius: 8px;
      background: transparent; color: var(--muted); cursor: pointer;
      display: grid; place-items: center;
    }
    .fb button:hover { background: rgba(12,20,24,.06); color: var(--ink); }
    .fb button.done { color: var(--accent); }
    .fb button svg { width: 14px; height: 14px; }
    .sys {
      align-self: center; font-size: 12px; color: var(--muted);
      text-align: center; max-width: 90%;
    }

    .chips {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      z-index: 2;
      display: flex; flex-wrap: wrap; align-items: center;
      gap: 6px;
      padding: 28px 14px 10px;
      max-height: 40%;
      overflow: auto;
      background: linear-gradient(
        180deg,
        rgba(243, 245, 247, 0) 0%,
        rgba(243, 245, 247, 0.55) 40%,
        var(--wash) 78%
      );
      pointer-events: none;
    }
    .chips > * { pointer-events: auto; }
    .chips:empty { display: none; padding: 0; background: none; }
    .chips-head {
      flex: 1 0 100%;
      display: flex; justify-content: flex-end; align-items: center;
      margin: -2px 0 0;
    }
    .chips-dismiss {
      width: 22px; height: 22px; border: none; border-radius: 6px;
      background: transparent; color: var(--muted); cursor: pointer;
      display: grid; place-items: center;
    }
    .chips-dismiss:hover { color: var(--ink); }
    .chips-dismiss svg { width: 12px; height: 12px; }
    .chip {
      border: 1px solid rgba(12,20,24,.16); background: transparent;
      border-radius: 999px; padding: 4px 10px;
      font: inherit; font-size: 12px; font-weight: 500; color: var(--ink);
      cursor: pointer; transition: border-color .15s, color .15s;
      text-align: left; line-height: 1.3;
      box-shadow: none;
    }
    .chip:hover { border-color: rgba(12,20,24,.32); background: transparent; }

    .footer {
      flex: 0 0 auto; padding: 8px 12px 14px;
      background: var(--wash);
      border-top: 1px solid rgba(12,20,24,.06);
    }
    .composer {
      display: flex; align-items: center; gap: 8px;
      background: var(--paper);
      border: 1.5px solid rgba(12,20,24,.55);
      border-radius: 999px; padding: 6px 6px 6px 16px;
      transition: border-color .15s, box-shadow .15s;
    }
    .composer:focus-within {
      border-color: var(--ink);
      box-shadow: 0 0 0 3px rgba(12,20,24,.08);
    }
    .composer input {
      flex: 1; border: none; outline: none; background: transparent;
      font: inherit; font-size: 14.5px; color: var(--ink); min-width: 0;
    }
    .composer input::placeholder { color: var(--muted); }
    .mic, .send {
      width: 38px; height: 38px; border: none; border-radius: 999px;
      display: grid; place-items: center; cursor: pointer; flex: 0 0 auto;
    }
    .mic { background: transparent; color: var(--muted); }
    .mic:hover { color: var(--ink); background: var(--wash); }
    .mic.listening { color: var(--accent); background: rgba(196,18,48,.08); }
    .mic svg, .send svg { width: 18px; height: 18px; }
    .send {
      background: #d5dbe0; color: #fff;
      transition: background .15s, transform .15s;
    }
    .send.ready { background: var(--ink); }
    .send.ready:hover { transform: scale(1.04); }
    .powered {
      margin-top: 8px; text-align: center;
      font-size: 11px; color: var(--muted); letter-spacing: 0.01em;
    }
  `;
  shadow.appendChild(style);

  const ICONS = {
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
    more: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    pen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
    end: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>`,
    up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>`,
    down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>`,
    mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`,
  };

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "iHello chat");
  panel.innerHTML = `
    <div class="header">
      <div class="brand">
        <span class="mark" aria-hidden="true"></span>
        <span class="brand-name">iHello</span>
      </div>
      <div class="hdr-actions">
        <div class="menu-wrap">
          <button type="button" class="icon-btn menu-toggle" aria-label="Chat options" aria-expanded="false">${ICONS.more}</button>
          <div class="menu" role="menu">
            <button type="button" data-action="new" role="menuitem">${ICONS.pen}<span>Start a new chat</span></button>
            <button type="button" data-action="end" role="menuitem">${ICONS.end}<span>End chat</span></button>
          </div>
        </div>
        <button type="button" class="icon-btn close-btn" aria-label="Close chat">${ICONS.close}</button>
      </div>
    </div>
    <div class="body">
      <div class="msgs" aria-live="polite"></div>
      <div class="chips"></div>
    </div>
    <div class="footer">
      <div class="composer">
        <input type="text" placeholder="Ask a question…" aria-label="Message" autocomplete="off" />
        <button type="button" class="mic" aria-label="Voice input" title="Voice input">${ICONS.mic}</button>
        <button type="button" class="send" aria-label="Send message" disabled>${ICONS.send}</button>
      </div>
      <div class="powered">Powered by iHello</div>
    </div>
  `;

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML = ICONS.chat;

  shadow.appendChild(panel);
  shadow.appendChild(launcher);

  const msgsEl = panel.querySelector(".msgs");
  const chipsEl = panel.querySelector(".chips");
  const inputEl = panel.querySelector("input");
  const sendBtn = panel.querySelector(".send");
  const micBtn = panel.querySelector(".mic");
  const menuToggle = panel.querySelector(".menu-toggle");
  const menuEl = panel.querySelector(".menu");
  const closeBtn = panel.querySelector(".close-btn");

  let open = false;
  let ws = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let healthyTimer = null;
  let connectionsThisPage = 0;
  let giveUp = false;
  let pendingSend = null;
  let busy = false;
  let currentAssistant = null;
  let currentMeta = null;
  let turnstileToken = "";
  let convId = getOrCreate("cw_conv");
  const visitorId = getOrCreate("cw_visitor");
  let config = {
    enabled: true,
    greeting: "",
    suggestions: [],
    placeholder: "Ask a question…",
    autoOpenSeconds: 0,
    turnstileSiteKey: "",
  };
  let recognition = null;
  let listening = false;
  let assistantCount = 0;

  function syncSend() {
    const ready = Boolean(inputEl.value.trim()) && !busy;
    sendBtn.classList.toggle("ready", ready);
    sendBtn.disabled = !ready;
  }

  function setOpen(v) {
    open = v;
    panel.classList.toggle("open", open);
    launcher.innerHTML = open ? ICONS.chevron : ICONS.chat;
    launcher.setAttribute("aria-label", open ? "Minimize chat" : "Open chat");
    if (!open) closeMenu();
    if (open) {
      showGreeting();
      inputEl.focus();
    }
  }

  function showGreeting() {
    if (!config.greeting) return;
    if (msgsEl.querySelector(".bubble")) return;
    addBubble("assistant", config.greeting);
  }

  /** User opened the chat — only now is a conversation worth a Durable Object. */
  function openChat() {
    setOpen(true);
    ensureConnected();
  }

  function closeMenu() {
    menuEl.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  }

  function relativeTime(ts) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 45) return "Just now";
    if (s < 90) return "1 minute ago";
    if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
    return "Earlier";
  }

  function polishText(text) {
    if (!text) return text;
    return text
      .replace(/\u2014/g, " - ")
      .replace(/\u2013/g, "-")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2026/g, "...")
      .replace(/ +([,.!?])/g, "$1");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function inlineMarkdown(escaped) {
    let s = escaped;
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
    return s;
  }

  function renderMarkdown(src) {
    const normalized = String(src || "").replace(/\r\n/g, "\n").trimEnd();
    if (!normalized.trim()) return "";
    const lines = normalized.split("\n");
    const parts = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i] || "";
      if (!line.trim()) {
        i += 1;
        continue;
      }
      if (line.trimStart().startsWith("```")) {
        const body = [];
        i += 1;
        while (i < lines.length && !(lines[i] || "").trimStart().startsWith("```")) {
          body.push(lines[i] || "");
          i += 1;
        }
        if (i < lines.length) i += 1;
        parts.push("<pre><code>" + escapeHtml(body.join("\n")) + "</code></pre>");
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] || "")) {
          const item = (lines[i] || "").replace(/^\s*[-*]\s+/, "");
          items.push("<li>" + inlineMarkdown(escapeHtml(item)) + "</li>");
          i += 1;
        }
        parts.push("<ul>" + items.join("") + "</ul>");
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] || "")) {
          const item = (lines[i] || "").replace(/^\s*\d+\.\s+/, "");
          items.push("<li>" + inlineMarkdown(escapeHtml(item)) + "</li>");
          i += 1;
        }
        parts.push("<ol>" + items.join("") + "</ol>");
        continue;
      }
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        parts.push(
          "<h" +
            level +
            ">" +
            inlineMarkdown(escapeHtml(heading[2])) +
            "</h" +
            level +
            ">",
        );
        i += 1;
        continue;
      }
      const para = [];
      while (i < lines.length && (lines[i] || "").trim()) {
        const cur = lines[i] || "";
        if (
          cur.trimStart().startsWith("```") ||
          /^\s*[-*]\s+/.test(cur) ||
          /^\s*\d+\.\s+/.test(cur) ||
          /^#{1,3}\s+/.test(cur)
        ) {
          break;
        }
        para.push(cur);
        i += 1;
      }
      parts.push(
        "<p>" +
          inlineMarkdown(escapeHtml(para.join("\n"))).replace(/\n/g, "<br />") +
          "</p>",
      );
    }
    return parts.join("");
  }

  function toolActivityLabel(toolName) {
    switch (toolName) {
      case "search_knowledge":
        return "Searching for relevant information…";
      case "book_meeting":
        return "Finding booking link…";
      case "handoff":
        return "Recording your details…";
      default:
        return "Working…";
    }
  }

  function activityMarkup(label) {
    let dots = "";
    for (let i = 0; i < 8; i++) {
      dots += '<span class="activity-dot" style="--i:' + i + '"></span>';
    }
    return (
      '<p class="activity" role="status">' +
      '<span class="activity-orb" aria-hidden="true">' +
      '<span class="activity-ring">' +
      dots +
      "</span></span>" +
      '<span class="activity-label">' +
      escapeHtml(label) +
      "</span></p>"
    );
  }

  function setAssistantActivity(bubble, label) {
    if (!bubble || (bubble.dataset.raw || "").trim()) return;
    bubble.classList.add("md");
    bubble.innerHTML = activityMarkup(label);
  }

  function appendStreamCaret(bubble, mode) {
    if (!bubble) return;
    const existing = bubble.querySelector(".stream-caret");
    if (existing) existing.remove();
    const caret = document.createElement("span");
    caret.className = "stream-caret" + (mode === "blink" ? " blink" : "");
    caret.setAttribute("aria-hidden", "true");
    bubble.appendChild(caret);
  }

  function finishStreamCaret(bubble) {
    if (!bubble) return;
    const caret = bubble.querySelector(".stream-caret");
    if (!caret) return;
    caret.classList.add("blink");
    setTimeout(() => {
      if (caret.parentNode) caret.remove();
    }, 700);
  }

  function applyStreamBody(body) {
    if (!body || typeof body.type !== "string") return "";
    const type = body.type;
    if (type === "text-delta" && body.delta) return body.delta;
    if (type === "text" && body.text) return body.text;
    if (type === "data-activity" && body.data && body.data.label) {
      setAssistantActivity(currentAssistant, body.data.label);
    } else if (
      type === "data-follow-ups" &&
      body.data &&
      Array.isArray(body.data.suggestions) &&
      body.data.suggestions.length
    ) {
      renderChips(body.data.suggestions);
    } else if (type === "tool-input-start" && body.toolName) {
      setAssistantActivity(currentAssistant, toolActivityLabel(body.toolName));
    } else if (type.startsWith("reasoning")) {
      setAssistantActivity(currentAssistant, "Thinking…");
    }
    return "";
  }

  function setBubbleContent(bubble, role, text) {
    if (role === "assistant") {
      bubble.classList.add("md");
      bubble.innerHTML = renderMarkdown(polishText(text));
    } else {
      bubble.classList.remove("md");
      bubble.textContent = text;
    }
  }

  function addBubble(role, text) {
    const row = document.createElement("div");
    row.className = "row " + role + " enter";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    setBubbleContent(bubble, role, text || "");
    row.appendChild(bubble);
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return { row, bubble };
  }

  function addSystem(text) {
    const el = document.createElement("div");
    el.className = "sys";
    el.textContent = text;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function attachMeta(row, index) {
    const meta = document.createElement("div");
    meta.className = "meta";
    const time = document.createElement("span");
    time.dataset.ts = String(Date.now());
    time.textContent = "Just now";
    const fb = document.createElement("div");
    fb.className = "fb";
    const up = document.createElement("button");
    up.type = "button";
    up.setAttribute("aria-label", "Helpful");
    up.innerHTML = ICONS.up;
    const down = document.createElement("button");
    down.type = "button";
    down.setAttribute("aria-label", "Not helpful");
    down.innerHTML = ICONS.down;
    const sendFb = (rating, btn) => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ t: "feedback", message_index: index, rating }));
      }
      up.classList.remove("done");
      down.classList.remove("done");
      btn.classList.add("done");
    };
    up.addEventListener("click", () => sendFb("up", up));
    down.addEventListener("click", () => sendFb("down", down));
    fb.appendChild(up);
    fb.appendChild(down);
    meta.appendChild(time);
    meta.appendChild(fb);
    row.appendChild(meta);
    return meta;
  }

  function refreshTimes() {
    for (const el of msgsEl.querySelectorAll(".meta span[data-ts]")) {
      el.textContent = relativeTime(Number(el.dataset.ts));
    }
  }
  setInterval(refreshTimes, 30000);

  function clearChips() {
    chipsEl.innerHTML = "";
    msgsEl.classList.remove("has-chips");
  }

  function renderChips(list) {
    clearChips();
    const labels = (list || [])
      .filter((s) => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (!labels.length) return;

    const head = document.createElement("div");
    head.className = "chips-head";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "chips-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss suggestions");
    dismiss.innerHTML = ICONS.close;
    dismiss.addEventListener("click", (e) => {
      e.stopPropagation();
      clearChips();
    });
    head.appendChild(dismiss);
    chipsEl.appendChild(head);

    for (const label of labels) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = label;
      b.addEventListener("click", () => {
        clearChips();
        sendMessage(label, "chip");
      });
      chipsEl.appendChild(b);
    }
    msgsEl.classList.add("has-chips");
    requestAnimationFrame(() => {
      msgsEl.scrollTop = msgsEl.scrollHeight;
    });
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (healthyTimer) {
      clearTimeout(healthyTimer);
      healthyTimer = null;
    }
    if (ws) {
      const sock = ws;
      ws = null;
      try {
        sock.close();
      } catch {
        /* ignore */
      }
    }
  }

  function stopReconnecting(message) {
    giveUp = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    busy = false;
    pendingSend = null;
    syncSend();
    if (message) addSystem(message);
  }

  function scheduleReconnect() {
    if (giveUp) return;
    const delays = [1000, 2000, 4000, 8000, 16000];
    if (reconnectAttempt >= delays.length) {
      stopReconnecting(
        "Chat is temporarily unavailable — reload the page to try again.",
      );
      return;
    }
    const delay = delays[reconnectAttempt++];
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function ensureConnected() {
    if (giveUp) return;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }
    connect();
  }

  function flushPending() {
    if (!pendingSend || !ws || ws.readyState !== WebSocket.OPEN) return;
    const payload = pendingSend;
    pendingSend = null;
    ws.send(JSON.stringify(payload));
  }

  function connect() {
    disconnect();
    if (giveUp) return;
    const MAX_CONNECTS_PER_PAGE = 12;
    if (connectionsThisPage >= MAX_CONNECTS_PER_PAGE) {
      stopReconnecting(
        "Chat is temporarily unavailable — reload the page to try again.",
      );
      return;
    }
    connectionsThisPage += 1;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const base = host.replace(/^https?/, proto);
    const sock = new WebSocket(`${base}/agents/chat-agent/${convId}`);
    ws = sock;

    sock.addEventListener("open", () => {
      if (ws !== sock) return;
      if (healthyTimer) clearTimeout(healthyTimer);
      healthyTimer = setTimeout(() => {
        healthyTimer = null;
        if (ws === sock) reconnectAttempt = 0;
      }, 10000);
      flushPending();
    });

    sock.addEventListener("message", (ev) => {
      if (ws !== sock) return;
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const type = msg.type;
      if (type === "cf_agent_chat_clear") {
        clearTranscript();
        showGreeting();
        return;
      }
      if (type === "cf_agent_chat_messages") {
        if (Array.isArray(msg.messages) && msg.messages.length) {
          clearTranscript();
          for (const m of msg.messages) {
            if (m.role !== "user" && m.role !== "assistant") continue;
            const textParts = (m.parts || [])
              .filter((p) => p.type === "text" && p.text)
              .map((p) => p.text)
              .join("");
            if (textParts) addBubble(m.role, textParts);
          }
        }
        return;
      }
      if (type === "cf_agent_use_chat_response") {
        if (msg.error) {
          busy = false;
          syncSend();
          const raw = (currentAssistant && currentAssistant.dataset.raw) || "";
          if (raw.trim() && currentAssistant && currentMeta) {
            setBubbleContent(currentAssistant, "assistant", raw);
            assistantCount += 1;
            attachMeta(currentMeta, assistantCount);
          } else if (currentAssistant && !(currentAssistant.dataset.raw || "").trim()) {
            currentAssistant.parentElement?.remove();
          }
          currentAssistant = null;
          currentMeta = null;
          if (!raw.trim()) addSystem("Something went wrong — please retry.");
          return;
        }
        let body = null;
        try {
          body = typeof msg.body === "string" ? JSON.parse(msg.body) : msg.body;
        } catch {
          body = null;
        }
        const chunk = applyStreamBody(body);
        if (chunk) {
          if (!currentAssistant) {
            const made = addBubble("assistant", "");
            currentAssistant = made.bubble;
            currentMeta = made.row;
            currentAssistant.dataset.raw = "";
          }
          currentAssistant.dataset.raw =
            (currentAssistant.dataset.raw || "") + chunk;
          setBubbleContent(
            currentAssistant,
            "assistant",
            currentAssistant.dataset.raw,
          );
          appendStreamCaret(currentAssistant, "solid");
          msgsEl.scrollTop = msgsEl.scrollHeight;
        }
        if (msg.done) {
          busy = false;
          syncSend();
          if (currentAssistant && currentMeta) {
            const raw = (currentAssistant.dataset.raw || "").trim();
            if (raw) {
              finishStreamCaret(currentAssistant);
              assistantCount += 1;
              attachMeta(currentMeta, assistantCount);
            } else if (!currentAssistant.textContent.trim()) {
              currentAssistant.parentElement?.remove();
            }
          }
          currentAssistant = null;
          currentMeta = null;
        }
        return;
      }
    });

    sock.addEventListener("close", () => {
      if (ws !== sock) return;
      ws = null;
      if (healthyTimer) {
        clearTimeout(healthyTimer);
        healthyTimer = null;
      }
      scheduleReconnect();
    });

    sock.addEventListener("error", () => {
      /* close handler drives reconnect */
    });
  }

  function clearTranscript() {
    msgsEl.innerHTML = "";
    currentAssistant = null;
    currentMeta = null;
    assistantCount = 0;
    busy = false;
    syncSend();
  }

  function startNewChat() {
    closeMenu();
    clearChips();
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "cf_agent_chat_clear" }));
      } catch {
        /* ignore */
      }
    }
    disconnect();
    giveUp = false;
    reconnectAttempt = 0;
    pendingSend = null;
    convId = uuid();
    localStorage.setItem("cw_conv", convId);
    clearTranscript();
    showGreeting();
    renderChips(config.suggestions || []);
    ensureConnected();
  }

  function endChat() {
    closeMenu();
    setOpen(false);
  }

  function sendMessage(text, source) {
    const t = (text || "").trim();
    if (!t || busy) return;
    if (giveUp) {
      addSystem(
        "Chat is temporarily unavailable — reload the page to try again.",
      );
      return;
    }
    busy = true;
    syncSend();
    clearChips();
    addBubble("user", t);
    inputEl.value = "";
    syncSend();
    const made = addBubble("assistant", "");
    currentAssistant = made.bubble;
    currentMeta = made.row;
    currentAssistant.dataset.raw = "";
    setAssistantActivity(currentAssistant, "Thinking…");
    pendingSend = {
      type: "cf_agent_use_chat_request",
      id: uuid(),
      init: {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              id: uuid(),
              role: "user",
              parts: [{ type: "text", text: t }],
            },
          ],
          page_url: location.href,
          visitor_id: visitorId,
          referrer: document.referrer || "",
          turnstile_token: turnstileToken,
          source,
        }),
      },
    };
    ensureConnected();
    flushPending();
  }

  launcher.addEventListener("click", () => {
    if (open) setOpen(false);
    else openChat();
  });
  closeBtn.addEventListener("click", () => setOpen(false));
  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = !menuEl.classList.contains("open");
    menuEl.classList.toggle("open", next);
    menuToggle.setAttribute("aria-expanded", String(next));
  });
  menuEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "new") startNewChat();
    if (btn.dataset.action === "end") endChat();
  });
  shadow.addEventListener("click", (e) => {
    if (!menuEl.classList.contains("open")) return;
    const path = e.composedPath();
    if (!path.includes(menuEl) && !path.includes(menuToggle)) closeMenu();
  });

  sendBtn.addEventListener("click", () => sendMessage(inputEl.value, "typed"));
  inputEl.addEventListener("input", syncSend);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage(inputEl.value, "typed");
  });

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.display = "none";
  } else {
    micBtn.addEventListener("click", () => {
      if (listening && recognition) {
        recognition.stop();
        return;
      }
      recognition = new SpeechRecognition();
      recognition.lang = document.documentElement.lang || "en-NZ";
      recognition.interimResults = true;
      recognition.continuous = false;
      listening = true;
      micBtn.classList.add("listening");
      recognition.onresult = (ev) => {
        let spoken = "";
        for (let i = 0; i < ev.results.length; i++) {
          spoken += ev.results[i][0].transcript;
        }
        inputEl.value = spoken;
        syncSend();
      };
      recognition.onerror = () => {
        listening = false;
        micBtn.classList.remove("listening");
      };
      recognition.onend = () => {
        listening = false;
        micBtn.classList.remove("listening");
      };
      recognition.start();
    });
  }

  async function boot() {
    try {
      const res = await fetch(
        `${host}/config?page=${encodeURIComponent(location.href)}`,
      );
      config = await res.json();
    } catch {
      config = {
        enabled: true,
        greeting: "Kia ora",
        suggestions: [],
        placeholder: "Ask a question…",
        autoOpenSeconds: 0,
        turnstileSiteKey: "",
      };
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
    syncSend();
    // Lazy connect: do not open a Durable Object until the visitor opens chat
    // or sends a message. Auto-open only reveals the panel.
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
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
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
