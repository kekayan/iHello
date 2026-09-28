import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { turnTraceFromMetadata, type TurnTrace } from "./api";
import { deriveAssistantActivity } from "./chat-activity";

export type PlaygroundStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "busy"
  | "error"
  | "closed";

export type WidgetConfig = {
  enabled: boolean;
  greeting: string;
  suggestions: string[];
  placeholder: string;
};

export type ToolHop = {
  id: string;
  name: string;
  state: string;
  input?: unknown;
  output?: unknown;
  /** Client-side duration when server trace is not yet available. */
  ms?: number;
};

const SESSION_KEY = "ihello.playground.conv";
const VISITOR_KEY = "ihello.playground.visitor";

/** Cap PartySocket retries — Infinity was the reconnect storm that burned DO quota. */
const AGENT_MAX_RETRIES = 4;
const AGENT_MIN_RECONNECT_MS = 2_000;
const AGENT_MAX_RECONNECT_MS = 15_000;

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStoredId(key: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(key);
}

function writeStoredId(key: string, id: string): string {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(key, id);
  }
  return id;
}

/** Stable across reloads. Only mint when missing. */
export function getOrCreateSessionId(): string {
  return readStoredId(SESSION_KEY) ?? writeStoredId(SESSION_KEY, uuid());
}

export function getOrCreateVisitorId(): string {
  return readStoredId(VISITOR_KEY) ?? writeStoredId(VISITOR_KEY, uuid());
}

/** Explicit "New session" only — never on config load / page URL edits. */
export function rotateSessionId(): string {
  return writeStoredId(SESSION_KEY, uuid());
}

function mapStatus(status: string, agentReady: boolean): PlaygroundStatus {
  if (!agentReady) return "connecting";
  switch (status) {
    case "submitted":
    case "streaming":
      return "busy";
    case "error":
      return "error";
    case "ready":
      return "ready";
    default:
      return "ready";
  }
}

/** Pull tool-call hops from AI SDK UIMessage parts for the turn log. */
export function toolHopsFromMessages(messages: UIMessage[]): ToolHop[] {
  const hops: ToolHop[] = [];
  for (const m of messages) {
    for (const part of m.parts ?? []) {
      const type = part.type;
      if (typeof type !== "string") continue;
      if (!type.startsWith("tool-") && type !== "dynamic-tool") continue;
      const p = part as {
        toolCallId?: string;
        toolName?: string;
        state?: string;
        input?: unknown;
        output?: unknown;
      };
      const name =
        p.toolName ||
        (type.startsWith("tool-") ? type.slice("tool-".length) : type);
      hops.push({
        id: p.toolCallId || `${m.id}-${hops.length}`,
        name,
        state: p.state || "unknown",
        input: p.input,
        output: p.output,
      });
    }
  }
  return hops;
}

/** Latest assistant message metadata written by ChatAgent.onChatResponse (preview). */
export function latestTurnTrace(messages: UIMessage[]): TurnTrace | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const trace = turnTraceFromMetadata(m.metadata);
    if (trace) return trace;
  }
  return null;
}

function isToolDone(state: string): boolean {
  return state.includes("result") || state === "output-available";
}

export function textFromMessage(message: UIMessage): string {
  return (message.parts ?? [])
    .filter(
      (p): p is { type: "text"; text: string } =>
        p.type === "text" && typeof (p as { text?: string }).text === "string",
    )
    .map((p) => p.text)
    .join("");
}

/** Collapse u·a·u·a·u streaks from queued submits — keep one user, last answer. */
export function collapseDuplicateTurns(messages: UIMessage[]): UIMessage[] {
  if (messages.length < 3) return messages;

  const out: UIMessage[] = [];
  let i = 0;

  while (i < messages.length) {
    const m = messages[i];
    if (m.role !== "user") {
      out.push(m);
      i++;
      continue;
    }

    const userText = textFromMessage(m).trim();
    out.push(m);
    i++;

    const assistants: UIMessage[] = [];
    while (i < messages.length) {
      const next = messages[i];
      if (next.role === "assistant") {
        assistants.push(next);
        i++;
        continue;
      }
      if (
        next.role === "user" &&
        textFromMessage(next).trim() === userText
      ) {
        i++;
        continue;
      }
      break;
    }

    if (assistants.length > 0) {
      out.push(assistants[assistants.length - 1]!);
    }
  }

  return out;
}

/**
 * Agent chat for an *already decided* session. Mount this only when the
 * playground is allowed to chat — mounting opens a DO WebSocket.
 *
 * DO identity = `sessionId` only. `pageUrl` is request body metadata and must
 * not change the Durable Object name.
 */
export function usePlaygroundChat(opts: {
  sessionId: string;
  pageUrl: string;
  greeting: string;
}) {
  const [visitorId] = useState(() => getOrCreateVisitorId());
  const [lastError, setLastError] = useState<string | null>(null);
  const toolStartedRef = useRef<Map<string, number>>(new Map());
  const [toolMs, setToolMs] = useState<Record<string, number>>({});
  const [activityLabel, setActivityLabel] = useState<string | null>(null);
  const [inflight, setInflight] = useState(false);
  const [dotLoader, setDotLoader] = useState(false);
  const [streamTrace, setStreamTrace] = useState<TurnTrace | null>(null);
  /** null = greeting chips from config; array = generated (or cleared while waiting). */
  const [followUps, setFollowUps] = useState<string[] | null>(null);
  const sendLockRef = useRef(false);

  const agent = useAgent({
    agent: "chat-agent",
    name: opts.sessionId,
    query: { preview: "1" },
    maxRetries: AGENT_MAX_RETRIES,
    minReconnectionDelay: AGENT_MIN_RECONNECT_MS,
    maxReconnectionDelay: AGENT_MAX_RECONNECT_MS,
    onConnectionError: (err) => {
      setLastError(err.message || String(err));
    },
    onOpen: () => {
      setLastError(null);
    },
  });

  const pageUrl =
    opts.pageUrl ||
    (typeof window !== "undefined" ? `${window.location.origin}/` : "/");

  const chat = useAgentChat({
    agent,
    resume: false,
    // Never Suspense-fetch history — playground is a fresh probe surface, and
    // a hanging get-messages left the route blank inside React Activity.
    getInitialMessages: null,
    body: {
      page_url: pageUrl,
      visitor_id: visitorId,
      referrer: "ihello-playground",
    },
    onError: (err) => {
      setLastError(err.message || String(err));
    },
    onData: (part) => {
      if (part.type === "data-activity") {
        const data = part.data;
        if (data && typeof data === "object" && "label" in data) {
          const label = (data as { label?: string }).label;
          if (label) {
            setDotLoader(false);
            setActivityLabel(label);
          }
        }
        return;
      }
      if (part.type === "data-turn-trace") {
        const trace = turnTraceFromMetadata({ turnTrace: part.data });
        if (trace) setStreamTrace(trace);
        return;
      }
      if (part.type === "data-follow-ups") {
        const data = part.data;
        if (data && typeof data === "object" && "suggestions" in data) {
          const list = (data as { suggestions?: unknown }).suggestions;
          if (Array.isArray(list)) {
            setFollowUps(
              list
                .filter((s): s is string => typeof s === "string")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 3),
            );
          }
        }
      }
    },
  });

  // Align DO transcript with empty client — stale sessionStorage ids kept old turns.
  useEffect(() => {
    chat.clearHistory();
  }, [opts.sessionId]);

  useEffect(() => {
    const ce = agent.connectionError;
    if (!ce) return;
    setLastError(ce.message || String(ce));
  }, [agent.connectionError]);

  useEffect(() => {
    const started = toolStartedRef.current;
    const updates: Record<string, number> = {};
    for (const m of chat.messages) {
      for (const part of m.parts ?? []) {
        const type = part.type;
        if (typeof type !== "string") continue;
        if (!type.startsWith("tool-") && type !== "dynamic-tool") continue;
        const p = part as {
          toolCallId?: string;
          state?: string;
        };
        const id = p.toolCallId;
        if (!id) continue;
        const state = p.state || "unknown";
        if (state === "input-available" || state === "input-streaming") {
          if (!started.has(id)) started.set(id, Date.now());
        }
        if (isToolDone(state) && started.has(id)) {
          updates[id] = Date.now() - started.get(id)!;
          started.delete(id);
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      setToolMs((prev) => ({ ...prev, ...updates }));
    }
  }, [chat.messages]);

  useEffect(() => {
    if (chat.status === "ready") {
      setActivityLabel(null);
      setDotLoader(false);
      setInflight(false);
      sendLockRef.current = false;
    }
  }, [chat.status]);

  const liveActivity = useMemo(
    () => deriveAssistantActivity(chat.messages, chat.status, activityLabel),
    [chat.messages, chat.status, activityLabel],
  );

  const status: PlaygroundStatus =
    lastError || chat.status === "error"
      ? "error"
      : inflight || chat.status === "submitted" || chat.status === "streaming"
        ? "busy"
        : mapStatus(chat.status, Boolean(agent));

  const displayMessages = useMemo(
    () => collapseDuplicateTurns(chat.messages),
    [chat.messages],
  );

  const bubbles = useMemo(() => {
    const rows: Array<{
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
      streaming?: boolean;
      activity?: string | null;
      loadingDots?: boolean;
    }> = [];
    if (opts.greeting && displayMessages.length === 0) {
      rows.push({
        id: "greeting",
        role: "assistant",
        content: opts.greeting,
      });
    }
    for (const m of displayMessages) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      const isLast = m.id === displayMessages.at(-1)?.id;
      const content = textFromMessage(m);
      const inFlight =
        isLast && (chat.status === "submitted" || chat.status === "streaming");
      rows.push({
        id: m.id,
        role: m.role,
        content,
        streaming: chat.status === "streaming" && isLast,
        activity:
          m.role === "assistant" && inFlight && !dotLoader
            ? liveActivity
            : null,
        loadingDots:
          m.role === "assistant" &&
          inFlight &&
          !content.trim() &&
          dotLoader &&
          !liveActivity,
      });
    }
    return rows;
  }, [displayMessages, chat.status, opts.greeting, liveActivity, dotLoader]);

  const toolHops = useMemo(() => {
    const hops = toolHopsFromMessages(chat.messages);
    return hops.map((h) => ({
      ...h,
      ms: toolMs[h.id] ?? h.ms,
    }));
  }, [chat.messages, toolMs]);

  const turnTrace = useMemo(() => {
    if (streamTrace) return streamTrace;
    return latestTurnTrace(chat.messages);
  }, [chat.messages, streamTrace]);

  const send = (text: string, _source: "typed" | "chip") => {
    const t = text.trim();
    if (!t || sendLockRef.current) return;
    if (
      inflight ||
      chat.status === "submitted" ||
      chat.status === "streaming"
    ) {
      return;
    }
    sendLockRef.current = true;
    setLastError(null);
    setInflight(true);
    setDotLoader(true);
    setActivityLabel(null);
    setStreamTrace(null);
    setFollowUps([]);
    toolStartedRef.current.clear();
    setToolMs({});
    void chat.sendMessage({ text: t }).finally(() => {
      setInflight(false);
      sendLockRef.current = false;
    });
  };

  const clearLocalHistory = () => {
    chat.clearHistory();
    setFollowUps(null);
    setStreamTrace(null);
  };

  return {
    status,
    bubbles,
    messages: chat.messages,
    toolHops,
    turnTrace,
    followUps,
    convId: opts.sessionId,
    lastError,
    send,
    clearLocalHistory,
  };
}
