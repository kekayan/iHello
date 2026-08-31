import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FormError, PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  usePlaygroundChat,
  type PlaygroundStatus,
  type WidgetConfig,
} from "@/lib/playground-chat";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/playground")({
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
      return "Thinking";
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

function PlaygroundPage() {
  const [pageUrl, setPageUrl] = useState(DEFAULT_PAGE);
  const [pageDraft, setPageDraft] = useState(DEFAULT_PAGE);
  const [sessionKey, setSessionKey] = useState(0);
  const [draft, setDraft] = useState("");
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [configErr, setConfigErr] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  const { status, bubbles, convId, send } = usePlaygroundChat({
    pageUrl,
    sessionKey,
    greeting: config?.greeting || "",
    active: config !== null && config.enabled !== false,
  });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [bubbles, status]);

  const chips = config?.suggestions || [];
  const disabled = config?.enabled === false;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Test"
        title="Playground"
        description="Preview chats use ?preview=1 — no Turnstile, rate limits, Slack, or live metrics."
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-[10px]"
            onClick={() => setSessionKey((k) => k + 1)}
          >
            New session
          </Button>
        }
      />

      {configErr ? <FormError message={configErr} /> : null}
      {disabled ? (
        <FormError message="Widget is disabled in Settings — enable it to chat." />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <aside className="surface space-y-4 p-4 self-start">
          <div className="space-y-1.5">
            <Label htmlFor="page-url">Page URL</Label>
            <Input
              id="page-url"
              value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value)}
              placeholder="https://example.com/services"
            />
            <p className="text-[12px] leading-relaxed text-[var(--ink-3)]">
              Applied to greeting variants and agent context.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full rounded-[10px]"
            onClick={() => {
              const next = pageDraft.trim() || DEFAULT_PAGE;
              setPageUrl(next);
              setPageDraft(next);
              setSessionKey((k) => k + 1);
            }}
          >
            Apply & reconnect
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
                {convId ? `DO · ${convId.slice(0, 8)}…` : "—"}
              </p>
              <p>Mode · preview</p>
            </div>
          </div>
        </aside>

        <div className="surface flex min-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-[8px] bg-[var(--ink)]">
                <svg
                  className="size-4"
                  viewBox="0 0 64 64"
                  aria-hidden
                  focusable="false"
                >
                  <path
                    d="M17 6h30a11 11 0 0 1 11 11v26a11 11 0 0 1-11 11H24l-11 9V52.7A11 11 0 0 1 6 43V17A11 11 0 0 1 17 6z"
                    fill="var(--paper)"
                  />
                  <rect
                    x="28.5"
                    y="27"
                    width="7"
                    height="19"
                    rx="3.5"
                    fill="var(--ink)"
                  />
                  <circle cx="32" cy="18" r="5" fill="var(--signal)" />
                </svg>
              </span>
              <div>
                <p className="text-[14px] font-medium tracking-[-0.02em] text-[var(--ink)]">
                  iHello
                </p>
                <p className="font-mono text-[10px] tracking-[0.06em] text-[var(--ink-3)] uppercase">
                  Widget preview
                </p>
              </div>
            </div>
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-[var(--peach)] px-2.5 font-mono text-[10px] font-medium tracking-[0.04em] text-[var(--peach-ink)] uppercase">
              Preview
            </span>
          </div>

          <div
            ref={scrollerRef}
            className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[color-mix(in_srgb,var(--paper-2)_70%,transparent)] px-4 py-4"
          >
            {bubbles.map((b) => {
              if (b.role === "system") {
                return (
                  <p
                    key={b.id}
                    className="self-center text-center text-[12px] text-[var(--ink-3)]"
                  >
                    {b.content}
                  </p>
                );
              }
              const mine = b.role === "user";
              return (
                <div
                  key={b.id}
                  className={cn(
                    "max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap",
                    mine
                      ? "self-end bg-[var(--ink)] text-[var(--paper)]"
                      : "self-start bg-[var(--paper)] text-[var(--ink)] ring-1 ring-[var(--line)]",
                    b.streaming && "opacity-95",
                  )}
                >
                  {b.content || (b.streaming ? "…" : "")}
                </div>
              );
            })}
          </div>

          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--line)] px-4 py-2.5">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={disabled || status === "busy" || status === "connecting"}
                  className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] disabled:opacity-50"
                  onClick={() => send(chip, "chip")}
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="flex gap-2 border-t border-[var(--line)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (disabled) return;
              send(draft, "typed");
              setDraft("");
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={config?.placeholder || "Ask a question…"}
              disabled={disabled || status === "connecting"}
              className="rounded-[10px]"
            />
            <Button
              type="submit"
              size="sm"
              className="rounded-[10px] px-4"
              disabled={
                disabled ||
                status === "busy" ||
                status === "connecting" ||
                !draft.trim()
              }
            >
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
