import { useCallback, useEffect, useRef, useState } from "react";

export type ChatRole = "user" | "assistant" | "system";

export type ChatBubble = {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
};

export type PlaygroundStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "busy"
  | "error"
  | "closed";

type ServerFrame =
  | { t: "ready"; history?: Array<{ role: "user" | "assistant"; content: string }> }
  | { t: "delta"; text?: string }
  | { t: "done"; handoff?: boolean }
  | { t: "refuse"; code?: string }
  | { t: "err" };

const REFUSE: Record<string, string> = {
  turnstile: "Verification failed — reload and try again.",
  rate: "One moment — try again shortly.",
  busy: "One moment — try again shortly.",
  too_long: "That message is too long.",
  too_many: "This conversation hit its message limit.",
  disabled: "The widget is disabled in settings.",
};

function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function wsBase(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

function parseFrame(raw: string): ServerFrame | null {
  try {
    const msg = JSON.parse(raw) as Record<string, unknown>;
    if (typeof msg.t !== "string") return null;
    switch (msg.t) {
      case "ready":
        return {
          t: "ready",
          history: Array.isArray(msg.history)
            ? (msg.history as Array<{ role: "user" | "assistant"; content: string }>)
            : [],
        };
      case "delta":
        return { t: "delta", text: typeof msg.text === "string" ? msg.text : "" };
      case "done":
        return { t: "done", handoff: Boolean(msg.handoff) };
      case "refuse":
        return {
          t: "refuse",
          code: typeof msg.code === "string" ? msg.code : undefined,
        };
      case "err":
        return { t: "err" };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export type WidgetConfig = {
  enabled: boolean;
  greeting: string;
  suggestions: string[];
  placeholder: string;
};

export function usePlaygroundChat(opts: {
  pageUrl: string;
  sessionKey: number;
  greeting: string;
  active: boolean;
}) {
  const [status, setStatus] = useState<PlaygroundStatus>("idle");
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [convId, setConvId] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const visitorIdRef = useRef(uuid());
  const greetingRef = useRef(opts.greeting);
  greetingRef.current = opts.greeting;

  const appendSystem = useCallback((content: string) => {
    setBubbles((prev) => [
      ...prev,
      { id: uuid(), role: "system", content },
    ]);
  }, []);

  const resetLocal = useCallback(() => {
    assistantIdRef.current = null;
    setBubbles([]);
  }, []);

  useEffect(() => {
    if (!opts.active) {
      setStatus("idle");
      setConvId("");
      resetLocal();
      return;
    }

    const id = uuid();
    setConvId(id);
    resetLocal();
    setStatus("connecting");
    visitorIdRef.current = uuid();

    const ws = new WebSocket(`${wsBase()}/agents/chat-agent/${id}?preview=1`);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          t: "hello",
          visitor_id: visitorIdRef.current,
          page_url: opts.pageUrl || `${location.origin}/`,
          referrer: "ihello-playground",
          turnstile_token: "",
        }),
      );
    });

    ws.addEventListener("message", (ev) => {
      const frame = parseFrame(String(ev.data));
      if (!frame) return;

      switch (frame.t) {
        case "ready": {
          const history = frame.history ?? [];
          if (history.length > 0) {
            setBubbles(
              history.map((h) => ({
                id: uuid(),
                role: h.role,
                content: h.content,
              })),
            );
          } else if (greetingRef.current) {
            setBubbles([
              {
                id: uuid(),
                role: "assistant",
                content: greetingRef.current,
              },
            ]);
          } else {
            setBubbles([]);
          }
          setStatus("ready");
          break;
        }
        case "delta": {
          const text = frame.text || "";
          setBubbles((prev) => {
            const aid = assistantIdRef.current;
            if (!aid) {
              const nid = uuid();
              assistantIdRef.current = nid;
              return [
                ...prev,
                { id: nid, role: "assistant", content: text, streaming: true },
              ];
            }
            return prev.map((b) =>
              b.id === aid
                ? { ...b, content: b.content + text, streaming: true }
                : b,
            );
          });
          break;
        }
        case "done": {
          const aid = assistantIdRef.current;
          assistantIdRef.current = null;
          setBubbles((prev) => {
            const next = prev.map((b) =>
              b.id === aid ? { ...b, streaming: false } : b,
            );
            const bubble = aid ? next.find((b) => b.id === aid) : undefined;
            if (bubble && !bubble.content.trim()) {
              return next.map((b) =>
                b.id === aid
                  ? {
                      ...b,
                      content: "No reply came back — check Worker logs / API keys.",
                      streaming: false,
                    }
                  : b,
              );
            }
            return next;
          });
          if (frame.handoff) {
            appendSystem("Handoff recorded (preview — skipped Slack / metrics).");
          }
          setStatus("ready");
          break;
        }
        case "refuse": {
          const aid = assistantIdRef.current;
          assistantIdRef.current = null;
          setBubbles((prev) => prev.filter((b) => b.id !== aid || b.content.trim()));
          appendSystem(REFUSE[frame.code || ""] || "Please try again.");
          setStatus("ready");
          break;
        }
        case "err": {
          const aid = assistantIdRef.current;
          assistantIdRef.current = null;
          setBubbles((prev) => prev.filter((b) => !(b.id === aid && !b.content.trim())));
          appendSystem("Something went wrong — retry.");
          setStatus("error");
          break;
        }
        default: {
          const _exhaustive: never = frame;
          void _exhaustive;
        }
      }
    });

    ws.addEventListener("error", () => {
      setStatus("error");
    });

    ws.addEventListener("close", () => {
      if (wsRef.current === ws) wsRef.current = null;
      setStatus((s) => (s === "connecting" ? "error" : "closed"));
    });

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [opts.pageUrl, opts.sessionKey, opts.active, appendSystem, resetLocal]);

  const send = useCallback(
    (text: string, source: "typed" | "chip") => {
      const t = text.trim();
      if (!t) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        appendSystem("Not connected — start a new session.");
        return;
      }
      if (status === "busy") return;

      setStatus("busy");
      const assistantId = uuid();
      assistantIdRef.current = assistantId;
      setBubbles((prev) => [
        ...prev,
        { id: uuid(), role: "user", content: t },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          streaming: true,
        },
      ]);
      ws.send(JSON.stringify({ t: "msg", text: t, source }));
    },
    [appendSystem, status],
  );

  return { status, bubbles, convId, send };
}
