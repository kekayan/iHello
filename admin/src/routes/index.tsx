import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, pct, type Metrics, type Settings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FormError, PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type SetupStep = {
  to: "/behaviour" | "/knowledge" | "/settings" | "/inbox";
  kicker: string;
  title: string;
  body: string;
  cta: string;
  done: boolean;
};

function HomePage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [knowledgeReady, setKnowledgeReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<Metrics>("/api/metrics"),
      api<Settings>("/api/settings"),
      api<{ result?: unknown[]; files?: unknown[] }>("/api/knowledge/files").catch(
        () => ({ result: [], files: [] }),
      ),
    ])
      .then(([metrics, s, files]) => {
        setM(metrics);
        setSettings(s);
        const list = files.result || files.files || [];
        setKnowledgeReady(Array.isArray(list) && list.length > 0);
      })
      .catch((e: Error) => setErr(e.message || "Couldn’t load home"));
  }, []);

  const fresh = m !== null && m.conversations7d === 0;
  const behaviourTouched =
    settings !== null &&
    (settings.greeting !==
      "Kia ora — ask about AI adoption, modernisation, or how we'd stand up a delivery pod for you." ||
      Object.keys(settings.variants || {}).length > 0);

  const steps: SetupStep[] = [
    {
      to: "/behaviour",
      kicker: "01",
      title: "Set behaviour",
      body: "Greeting, chips, and how the agent answers — or generate a draft from your site.",
      cta: "Open behaviour",
      done: behaviourTouched,
    },
    {
      to: "/knowledge",
      kicker: "02",
      title: "Add knowledge",
      body: "Upload pages or docs so answers stay grounded in your material.",
      cta: "Open knowledge",
      done: knowledgeReady,
    },
    {
      to: "/settings",
      kicker: "03",
      title: "Confirm settings",
      body: "Model, SLA text, retention, and the kill switch before you go live.",
      cta: "Open settings",
      done: settings?.enabled === true && Boolean(settings.slaText),
    },
  ];

  const remaining = steps.filter((s) => !s.done).length;
  const doneCount = steps.length - remaining;
  const showOnboard = fresh || remaining > 0;
  const progress = (doneCount / steps.length) * 100;

  const items = [
    { label: "Conversations", value: m ? String(m.conversations7d) : "—" },
    { label: "Handoffs", value: m ? String(m.handoffs7d) : "—" },
    { label: "Conversion", value: m ? pct(m.conversion) : "—" },
    { label: "Unanswered", value: m ? pct(m.unansweredRate) : "—" },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Overview"
        title={showOnboard ? "Get iHello ready" : "Home"}
        description={
          showOnboard
            ? "Finish setup before you embed the widget. Behaviour, knowledge, then settings — in that order."
            : "What visitors did in the last 7 days — preview traffic left out."
        }
        action={
          showOnboard ? (
            <Button asChild size="sm" className="rounded-[10px]">
              <Link to="/behaviour">Start onboarding</Link>
            </Button>
          ) : undefined
        }
      />

      {err ? <FormError message={err} /> : null}

      {showOnboard ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <p className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
                Setup · {remaining} left
              </p>
              <div className="h-1.5 w-44 overflow-hidden rounded-full bg-[var(--paper-3)]">
                <div
                  className="h-full rounded-full bg-[var(--signal)] transition-[width] duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="font-mono text-[12px] tabular-nums text-[var(--ink-3)]">
              {doneCount}/{steps.length}
            </p>
          </div>

          <div className="surface overflow-hidden">
            {steps.map((step, i) => {
              const next = !step.done && steps.slice(0, i).every((s) => s.done);
              return (
                <div
                  key={step.to}
                  className={`flex flex-col gap-4 p-5 transition-colors md:flex-row md:items-center md:justify-between ${
                    i < steps.length - 1 ? "border-b border-[var(--line)]" : ""
                  } ${
                    step.done
                      ? "bg-[var(--paper-3)]/45"
                      : next
                        ? "bg-[color-mix(in_srgb,var(--signal-tint)_55%,var(--paper))]"
                        : "bg-transparent"
                  }`}
                >
                  <div className="grid min-w-0 grid-cols-[44px_1fr] gap-3">
                    <span
                      className={`font-mono text-[12px] tabular-nums ${
                        next
                          ? "font-medium text-[var(--signal-deep)]"
                          : "text-[var(--ink-3)]"
                      }`}
                    >
                      {step.kicker}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] font-medium tracking-[-0.01em] text-[var(--ink)]">
                          {step.title}
                        </h2>
                        {step.done ? (
                          <span className="inline-flex h-[22px] items-center rounded-full bg-[var(--mint)] px-2 font-mono text-[10px] font-medium tracking-[0.04em] text-[var(--mint-ink)] uppercase">
                            Done
                          </span>
                        ) : next ? (
                          <span className="inline-flex h-[22px] items-center rounded-full bg-[var(--peach)] px-2 font-mono text-[10px] font-medium tracking-[0.04em] text-[var(--peach-ink)] uppercase">
                            Next
                          </span>
                        ) : (
                          <span className="inline-flex h-[22px] items-center rounded-full bg-[var(--paper-3)] px-2 font-mono text-[10px] font-medium tracking-[0.04em] text-[var(--ink-3)] uppercase">
                            Later
                          </span>
                        )}
                      </div>
                      <p className="max-w-[48ch] text-[14px] leading-relaxed text-[var(--ink-2)]">
                        {step.body}
                      </p>
                    </div>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant={step.done || !next ? "outline" : "default"}
                    className="shrink-0 rounded-[10px]"
                  >
                    <Link to={step.to}>
                      {step.done ? "Review" : step.cta}
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] bg-[var(--paper)]/60 px-5 py-4">
            <p className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
              After setup
            </p>
            <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-[var(--ink-2)]">
              Embed the widget with{" "}
              <code className="rounded-[7px] bg-[var(--ink)] px-1.5 py-0.5 font-mono text-[12px] font-medium text-[var(--paper)]">
                &lt;script src="/embed.js" async&gt;&lt;/script&gt;
              </code>{" "}
              on your site — or try it first in{" "}
              <Link
                to="/playground"
                className="font-medium text-[var(--ink)] underline-offset-2 hover:underline"
              >
                Playground
              </Link>
              . Preview chats won’t count toward the metrics below.
            </p>
          </div>
        </section>
      ) : null}

      <div>
        <p className="mono-label mb-3 font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
          Last 7 days
        </p>
        <div className="surface grid grid-cols-2 md:grid-cols-4">
          {items.map((item, i) => (
            <div
              key={item.label}
              className={`px-5 py-5 ${
                i < items.length - 1 ? "md:border-r md:border-[var(--line)]" : ""
              } ${i % 2 === 0 ? "border-r border-[var(--line)] md:border-r" : ""} ${
                i < 2 ? "border-b border-[var(--line)] md:border-b-0" : ""
              }`}
            >
              <span className="mono-label block font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
                {item.label}
              </span>
              <span className="metric-value mt-3 block text-[34px] font-medium text-[var(--ink)] md:text-[38px]">
                {item.value}
              </span>
            </div>
          ))}
        </div>
        {fresh && !showOnboard ? (
          <p className="mt-3 text-[13px] text-[var(--ink-3)]">
            No live conversations yet.{" "}
            <Link
              to="/inbox"
              search={{ conv: undefined }}
              className="font-medium text-[var(--ink)] underline-offset-2 hover:underline"
            >
              Check inbox
            </Link>{" "}
            after you embed the widget.
          </p>
        ) : null}
      </div>
    </div>
  );
}
