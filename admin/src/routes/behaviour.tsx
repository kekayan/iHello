import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { assembleSystemPrompt } from "@shared/system-prompt";
import { api, type Settings } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { FormError, PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/behaviour")({
  component: BehaviourPage,
});

const PROCEDURE_FIELDS = [
  {
    key: "identity" as const,
    label: "Identity",
    hint: 'How the bot answers "who are you" — voice, role, and company naming.',
    rows: 3,
  },
  {
    key: "answering" as const,
    label: "Answering",
    hint: "What topics to cover, grounding, inventing facts, how work is framed.",
    rows: 3,
  },
  {
    key: "tool_policy" as const,
    label: "Tool policy",
    hint: "When to call search_knowledge, handoff, or book_meeting — and what never to reveal.",
    rows: 3,
  },
  {
    key: "uncertainty" as const,
    label: "Uncertainty",
    hint: "Empty knowledge base or weak hits — say so and offer a human.",
    rows: 2,
  },
  {
    key: "lead" as const,
    label: "Lead",
    hint: "Buying intent and when to hand off as a lead.",
    rows: 2,
  },
  {
    key: "escalation" as const,
    label: "Escalation",
    hint: "Problems and human requests. Use {slaText} for the SLA phrase.",
    rows: 2,
  },
  {
    key: "examples" as const,
    label: "Examples",
    hint: "Short few-shot lines (identity, FAQ+search, decline coding, buying→handoff).",
    rows: 4,
  },
];

function emptyProcedures(): Settings["procedures"] {
  return {
    identity: "",
    answering: "",
    lead: "",
    escalation: "",
    tool_policy: "",
    uncertainty: "",
    examples: "",
  };
}

function BehaviourPage() {
  const { toast } = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [variants, setVariants] = useState<Settings["variants"]>({});
  const [chipNew, setChipNew] = useState("");
  const [vPath, setVPath] = useState("");
  const [vGreeting, setVGreeting] = useState("");
  const [previewPageUrl, setPreviewPageUrl] = useState(
    "https://example.com/services",
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function apply(settings: Settings) {
    setS({
      ...settings,
      procedures: { ...emptyProcedures(), ...settings.procedures },
    });
    setChips([...(settings.suggestions || [])]);
    setVariants({ ...(settings.variants || {}) });
  }

  useEffect(() => {
    api<Settings>("/api/settings")
      .then(apply)
      .catch((e: Error) => setErr(e.message));
  }, []);

  const assembled = useMemo(() => {
    if (!s) return "";
    return assembleSystemPrompt({
      procedures: s.procedures,
      slaText: s.slaText,
      context: "",
      pageUrl: previewPageUrl.trim() || undefined,
    });
  }, [s, previewPageUrl]);

  if (!s) {
    return err ? (
      <FormError message={err} />
    ) : (
      <p className="text-[13px] text-[var(--ink-3)]">Loading…</p>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Setup"
        title="Behaviour"
        description="Edit lean procedure blocks on the left. The right pane shows the fully assembled system prompt as you type."
      />
      {err ? <FormError message={err} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {/* LEFT — editors */}
        <div className="surface max-h-[min(880px,calc(100vh-8rem))] space-y-5 overflow-y-auto p-5">
          {PROCEDURE_FIELDS.map(({ key, label, hint, rows }) => (
            <div className="space-y-1.5" key={key}>
              <Label htmlFor={key}>{label}</Label>
              <Textarea
                id={key}
                rows={rows}
                value={s.procedures[key] ?? ""}
                onChange={(e) =>
                  setS({
                    ...s,
                    procedures: { ...s.procedures, [key]: e.target.value },
                  })
                }
              />
              <p className="text-[12px] text-[var(--ink-3)]">{hint}</p>
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="greeting">Greeting</Label>
            <Textarea
              id="greeting"
              rows={2}
              value={s.greeting}
              onChange={(e) => setS({ ...s, greeting: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Suggestion chips</Label>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <Badge
                  key={`${c}-${i}`}
                  variant="secondary"
                  className="gap-1 rounded-full px-2.5 py-1"
                >
                  {c}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${c}`}
                    onClick={() => setChips(chips.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                value={chipNew}
                onChange={(e) => setChipNew(e.target.value)}
                placeholder="New chip"
                className="max-w-[16rem]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const v = chipNew.trim();
                  if (!v) return;
                  setChips([...chips, v]);
                  setChipNew("");
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Per-page greeting overrides</Label>
            {Object.keys(variants).length === 0 ? (
              <p className="text-[12px] text-[var(--ink-3)]">None yet.</p>
            ) : null}
            {Object.entries(variants).map(([path, v]) => (
              <div
                key={path}
                className="flex flex-wrap items-center gap-2 border-b border-border py-2 last:border-b-0"
              >
                <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] font-medium">
                  {path}
                </code>
                <span className="text-[13px] text-muted-foreground">
                  {v.greeting || ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = { ...variants };
                    delete next[path];
                    setVariants(next);
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Input
                value={vPath}
                onChange={(e) => setVPath(e.target.value)}
                placeholder="/services"
                className="max-w-[10rem]"
              />
              <Input
                value={vGreeting}
                onChange={(e) => setVGreeting(e.target.value)}
                placeholder="Variant greeting"
                className="max-w-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const path = vPath.trim();
                  if (!path) return;
                  setVariants({
                    ...variants,
                    [path]: {
                      greeting: vGreeting.trim(),
                      suggestions: chips.slice(),
                    },
                  });
                  setVPath("");
                  setVGreeting("");
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {(["Lead-gen", "Support"] as const).map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    apply(
                      await api<Settings>("/api/settings", {
                        method: "PUT",
                        body: JSON.stringify({ preset }),
                      }),
                    );
                    toast(`${preset} preset applied`);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Preset failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {preset}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  apply(
                    await api<Settings>("/api/settings", {
                      method: "PUT",
                      body: JSON.stringify({ resetBehaviour: true }),
                    }),
                  );
                  toast("Reset to lean defaults");
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Reset failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reset defaults
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  apply(
                    await api<Settings>("/api/settings", {
                      method: "PUT",
                      body: JSON.stringify({
                        greeting: s.greeting,
                        suggestions: chips,
                        variants,
                        procedures: s.procedures,
                      }),
                    }),
                  );
                  toast("Behaviour saved");
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Save failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </div>

        {/* RIGHT — live assembled prompt */}
        <aside className="surface sticky top-[70px] flex max-h-[min(880px,calc(100vh-8rem))] flex-col overflow-hidden p-5">
          <div className="mb-3 space-y-2">
            <h2 className="text-[15px] font-semibold tracking-tight">
              Assembled system prompt
            </h2>
            <p className="text-[12px] text-[var(--ink-3)]">
              Writing style and Runtime defaults are injected even when you do
              not edit those fields. Preview updates on every keystroke.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="preview-page-url">Preview page URL</Label>
              <Input
                id="preview-page-url"
                value={previewPageUrl}
                onChange={(e) => setPreviewPageUrl(e.target.value)}
                placeholder="https://example.com/services"
              />
            </div>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto rounded-[10px] border border-[var(--line)] bg-[var(--paper-3)] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--ink-2)]">
            {assembled}
          </pre>
        </aside>
      </div>
    </div>
  );
}
