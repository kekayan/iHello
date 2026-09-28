import { MarkdownBubble } from "@/components/MarkdownBubble";
import { FormError, PageHeader } from "@/components/PageHeader";
import { TurnTracePanel } from "@/components/TurnTracePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getOrCreateSessionId,
  usePlaygroundChat,
  type PlaygroundStatus,
  type WidgetConfig,
} from "@/lib/playground-chat";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/playground")({
  ssr: false,
  component: PlaygroundPage,
});

const DEFAULT_PAGE = "https://example.com/";

function statusLabel(status: PlaygroundStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting";
    case "ready":
      return "Ready";
    case "busy":
      return "Replying";
    case "error":
      return "Error";
    case "closed":
      return "Disconnected";
    case "idle":
      return "Idle";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatError(err: string): string {
  if (/rows written|free tier/i.test(err)) {
    return "Durable Object SQLite write quota hit (Workers Free). Wait until 00:00 UTC or enable Workers Paid. Reuse one session; Clear chat does not mint a new DO.";
  }
  return err;
}

function PlaygroundPage() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="space-y-6">
        <PageHeader
          kicker="Test"
          title="Playground"
          description="Loading chat harness…"
        />
        <div className="surface h-[320px] animate-pulse rounded-[22px]" />
      </div>
    );
  }

  return <PlaygroundShell />;
}

/** Session + config only — does not open a DO WebSocket. */
function PlaygroundShell() {
  const [pageUrl, setPageUrl] = useState(DEFAULT_PAGE);
  const [pageDraft, setPageDraft] = useState(DEFAULT_PAGE);
  const [sessionId, setSessionId] = useState(() => getOrCreateSessionId());
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [configErr, setConfigErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConfigErr(null);
    void fetch(`/config?page=${encodeURIComponent(pageUrl)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<WidgetConfig>;
      })
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setConfigErr(e.message || "Couldn’t load /config");
          setConfig({
            enabled: true,
            greeting: "",
            suggestions: [],
            placeholder: "Ask a question…",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageUrl]);

  const chatAllowed = config !== null && config.enabled !== false;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Test"
        title="Playground"
        description="AIChatAgent harness on a Durable Object. Middle: chat. Right: tool hops from the agent loop."
      />

      {configErr ? <FormError message={configErr} /> : null}
      {config?.enabled === false ? (
        <FormError message="Widget is disabled in Settings — enable it to chat." />
      ) : null}

      {chatAllowed ? (
        <PlaygroundAgent
          key={sessionId}
          sessionId={sessionId}
          pageUrl={pageUrl}
          pageDraft={pageDraft}
          setPageDraft={setPageDraft}
          onApplyPage={() => {
            const next = pageDraft.trim() || DEFAULT_PAGE;
            setPageUrl(next);
            setPageDraft(next);
          }}
          config={config}
        />
      ) : (
        <div className="surface grid min-h-[320px] place-items-center rounded-[22px] text-[14px] text-[var(--ink-3)]">
          {config === null ? "Loading widget config…" : "Chat disabled"}
        </div>
      )}
    </div>
  );
}

/** Mounts useAgent — opens exactly one DO for `sessionId`. */
function PlaygroundAgent({
  sessionId,
  pageUrl,
  pageDraft,
  setPageDraft,
  onApplyPage,
  config,
}: {
  sessionId: string;
  pageUrl: string;
  pageDraft: string;
  setPageDraft: (v: string) => void;
  onApplyPage: () => void;
  config: WidgetConfig;
}) {
  const {
    status,
    bubbles,
    toolHops,
    turnTrace,
    followUps,
    convId,
    lastError,
    send,
    clearLocalHistory,
  } = usePlaygroundChat({
      sessionId,
      pageUrl,
      greeting: config.greeting || "",
    });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [bubbles, status]);

  const chips =
    followUps !== null ? followUps : config.suggestions || [];

  return (
    <>
      {lastError ? <FormError message={formatError(lastError)} /> : null}

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="surface space-y-4 self-start p-4">
          <div className="space-y-1.5">
            <Label htmlFor="page-url">Page URL</Label>
            <Input
              id="page-url"
              value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value)}
              placeholder="https://example.com/services"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full rounded-[10px]"
            onClick={onApplyPage}
          >
            Apply page URL
          </Button>

          <div className="space-y-2 border-t border-[var(--line)] pt-3">
            <p className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
              Session
            </p>
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="text-[var(--ink-3)]">Status</span>
              <span
                className={cn(
                  "inline-flex h-[22px] items-center rounded-full px-2 font-mono text-[10px] font-medium tracking-[0.04em] uppercase",
                  status === "ready" || status === "busy"
                    ? "bg-[var(--mint)] text-[var(--mint-ink)]"
                    : status === "error"
                      ? "bg-[var(--rose)] text-[var(--rose-ink)]"
                      : "bg-[var(--paper-3)] text-[var(--ink-3)]",
                )}
              >
                {statusLabel(status)}
              </span>
            </div>
            <div className="space-y-1 text-[12px] text-[var(--ink-3)]">
              <p className="truncate font-mono" title={convId}>
                DO · {convId.slice(0, 8)}…
              </p>
              <p>Harness · AIChatAgent</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 w-full rounded-[10px]"
                onClick={() => clearLocalHistory()}
              >
                Clear chat
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-[620px] flex-col overflow-hidden rounded-[22px] bg-[#f3f5f7] shadow-[0_22px_60px_rgba(12,20,24,0.18)] ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-3 bg-gradient-to-b from-[#121c20] to-[#0c1418] px-4 py-3.5 text-white">
            <div className="flex items-center gap-2.5">
              <span
                className="size-[30px] shrink-0 rounded-full shadow-[inset_0_0_0_2px_rgba(255,255,255,0.12)]"
                style={{
                  background:
                    "radial-gradient(circle at 35% 35%, #ff5a6e 0 28%, transparent 30%), conic-gradient(from 210deg, #c41230, #1a1a1a 45%, #c41230 70%, #fff 100%)",
                }}
                aria-hidden
              />
              <div>
                <p className="text-[16px] font-semibold tracking-[-0.02em]">
                  iHello
                </p>
                <p className="font-mono text-[10px] tracking-[0.08em] text-white/45 uppercase">
                  Widget preview
                </p>
              </div>
            </div>
            <span className="inline-flex h-[26px] items-center rounded-full bg-white/10 px-2.5 font-mono text-[10px] font-medium tracking-[0.04em] text-white/80 uppercase">
              Preview
            </span>
          </div>

          <div
            ref={scrollerRef}
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-4"
          >
            {bubbles.map((b) => {
              if (b.role === "system") {
                return (
                  <p
                    key={b.id}
                    className="self-center text-center text-[12px] text-[#8b969e]"
                  >
                    {b.content}
                  </p>
                );
              }
              if (b.role === "user") {
                return (
                  <div
                    key={b.id}
                    className="max-w-[85%] self-end rounded-[18px] rounded-br-[8px] bg-[#0c1418] px-3.5 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-white"
                  >
                    {b.content || (b.streaming ? "…" : "")}
                  </div>
                );
              }
              return (
                <div key={b.id} className="max-w-[85%] self-start">
                  <MarkdownBubble
                    content={b.content}
                    streaming={b.streaming}
                    activity={b.activity}
                    loadingDots={b.loadingDots}
                    className={cn(
                      "rounded-[18px] rounded-bl-[8px] bg-[#e8ecef] px-3.5 py-2.5 text-[14.5px] leading-relaxed text-[#0c1418]",
                      b.streaming && "opacity-95",
                    )}
                  />
                </div>
              );
            })}
          </div>

          {chips.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-2 px-3.5 pb-2.5">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={status === "busy" || status === "connecting"}
                  className="rounded-full border border-black/15 bg-transparent px-2.5 py-1 text-[12px] font-medium text-[#0c1418] transition-colors hover:border-black/30 disabled:opacity-50"
                  onClick={() => send(chip, "chip")}
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="px-3 pt-1 pb-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft, "typed");
              setDraft("");
            }}
          >
            <div className="flex items-center gap-2 rounded-full border-[1.5px] border-[#0c1418]/55 bg-white py-1.5 pr-1.5 pl-4 focus-within:border-[#0c1418] focus-within:shadow-[0_0_0_3px_rgba(12,20,24,0.08)]">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={config.placeholder || "Ask a question…"}
                disabled={status === "connecting"}
                className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="icon"
                className={cn(
                  "size-[38px] shrink-0 rounded-full",
                  draft.trim()
                    ? "bg-[#0c1418] text-white hover:bg-[#0c1418]/90"
                    : "bg-[#d5dbe0] text-white hover:bg-[#d5dbe0]",
                )}
                disabled={
                  status === "busy" ||
                  status === "connecting" ||
                  !draft.trim()
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 19V5M6 11l6-6 6 6" />
                </svg>
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-[#8b969e]">
              Powered by iHello · AIChatAgent
            </p>
          </form>
        </div>

        <TurnTracePanel
          toolHops={toolHops}
          trace={turnTrace}
          streaming={status === "busy"}
        />
      </div>
    </>
  );
}
