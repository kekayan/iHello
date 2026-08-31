import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

function BehaviourPage() {
  const { toast } = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [variants, setVariants] = useState<Settings["variants"]>({});
  const [chipNew, setChipNew] = useState("");
  const [vPath, setVPath] = useState("");
  const [vGreeting, setVGreeting] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function apply(settings: Settings) {
    setS(settings);
    setChips([...(settings.suggestions || [])]);
    setVariants({ ...(settings.variants || {}) });
  }

  useEffect(() => {
    api<Settings>("/api/settings")
      .then(apply)
      .catch((e: Error) => setErr(e.message));
  }, []);

  if (!s) {
    return err ? (
      <FormError message={err} />
    ) : (
      <p className="text-[13px] text-[var(--ink-3)]">Loading…</p>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Setup"
        title="Behaviour"
        description="How the agent talks, greets, and when it asks for a handoff."
      />
      {err ? <FormError message={err} /> : null}

      <div className="surface space-y-4 p-5">
        {(
          [
            ["identity", "Identity"],
            ["answering", "Answering"],
            ["lead", "Lead"],
            ["escalation", "Escalation"],
          ] as const
        ).map(([key, label]) => (
          <div className="space-y-1.5" key={key}>
            <Label htmlFor={key}>{label}</Label>
            <Textarea
              id={key}
              value={s.procedures[key]}
              onChange={(e) =>
                setS({
                  ...s,
                  procedures: { ...s.procedures, [key]: e.target.value },
                })
              }
            />
          </div>
        ))}

        <div className="space-y-1.5">
          <Label htmlFor="greeting">Greeting</Label>
          <Textarea
            id="greeting"
            value={s.greeting}
            onChange={(e) => setS({ ...s, greeting: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Chips</Label>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c, i) => (
              <Badge key={`${c}-${i}`} variant="secondary" className="gap-1 rounded-full px-2.5 py-1">
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
              Add chip
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Per-page variants</Label>
          {Object.entries(variants).map(([path, v]) => (
            <div
              key={path}
              className="flex flex-wrap items-center gap-2 border-b border-border py-2 last:border-b-0"
            >
              <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] font-medium">
                {path}
              </code>
              <span className="text-[13px] text-muted-foreground">{v.greeting || ""}</span>
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
                  [path]: { greeting: vGreeting.trim(), suggestions: chips.slice() },
                });
                setVPath("");
                setVGreeting("");
              }}
            >
              Add variant
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {(["Lead-gen", "Support", "Sales"] as const).map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await api("/api/settings", {
                  method: "PUT",
                  body: JSON.stringify({ preset }),
                });
                apply(await api<Settings>("/api/settings"));
                toast("Preset applied — review and save");
              }}
            >
              {preset}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              const res = await api<{
                draft: {
                  procedures: Settings["procedures"];
                  greeting: string;
                  suggestions: string[];
                };
              }>("/api/onboard/analyze", { method: "POST", body: "{}" });
              const d = res.draft;
              setS({
                ...s,
                procedures: d.procedures,
                greeting: d.greeting,
              });
              setChips([...(d.suggestions || [])]);
              toast("Draft filled — review and save");
            }}
          >
            Generate from site
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              const next = await api<Settings>("/api/settings", {
                method: "PUT",
                body: JSON.stringify({
                  greeting: s.greeting,
                  suggestions: chips,
                  variants,
                  procedures: s.procedures,
                }),
              });
              apply(next);
              toast("Behaviour saved");
            }}
          >
            Save behaviour
          </Button>
        </div>
      </div>
    </div>
  );
}
