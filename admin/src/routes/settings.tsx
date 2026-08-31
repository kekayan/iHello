import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api, type ModelOption, type ModelsResponse, type Settings } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { FormError, PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const GROUP_ORDER: ModelOption["group"][] = ["OpenAI", "Anthropic", "Workers AI"];

function SettingsPage() {
  const { toast } = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelDefault, setModelDefault] = useState("anthropic/claude-sonnet-5");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Settings>("/api/settings"),
      api<ModelsResponse>("/api/models"),
    ])
      .then(([settings, catalog]) => {
        setS(settings);
        setModels(catalog.models);
        setModelDefault(catalog.default);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: models.filter((m) => m.group === group),
    })).filter((g) => g.items.length > 0);
  }, [models]);

  const selectedBlurb = useMemo(() => {
    if (!s?.modelMain) {
      const hit = models.find((m) => m.id === modelDefault);
      return hit ? `Default · ${hit.blurb}` : "Uses wrangler MODEL_MAIN_DEFAULT";
    }
    return models.find((m) => m.id === s.modelMain)?.blurb ?? s.modelMain;
  }, [s?.modelMain, models, modelDefault]);

  if (!s) {
    return err ? (
      <FormError message={err} />
    ) : (
      <p className="text-[13px] text-[var(--ink-3)]">Loading…</p>
    );
  }

  const defaultLabel =
    models.find((m) => m.id === modelDefault)?.label ?? "account default";

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Setup"
        title="Settings"
        description="AI Gateway model, retention, limits, and the kill switch."
      />
      {err ? <FormError message={err} /> : null}

      <div className="surface space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Model</Label>
            <Select
              value={s.modelMain || "__default"}
              onValueChange={(v) =>
                setS({ ...s, modelMain: !v || v === "__default" ? "" : v })
              }
            >
              <SelectTrigger className="w-full max-w-xl">
                <SelectValue placeholder={`Account default (${defaultLabel})`} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="__default">
                  Account default ({defaultLabel})
                </SelectItem>
                {grouped.map(({ group, items }) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {items.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[12px] text-[var(--ink-3)]">{selectedBlurb}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retentionDays">Retention days</Label>
            <Input
              id="retentionDays"
              type="number"
              value={s.retentionDays}
              onChange={(e) => setS({ ...s, retentionDays: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxMessages">Max messages</Label>
            <Input
              id="maxMessages"
              type="number"
              value={s.maxMessages}
              onChange={(e) => setS({ ...s, maxMessages: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="autoOpenSeconds">Auto-open seconds</Label>
            <Input
              id="autoOpenSeconds"
              type="number"
              value={s.autoOpenSeconds}
              onChange={(e) =>
                setS({ ...s, autoOpenSeconds: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slaText">SLA text</Label>
            <Input
              id="slaText"
              value={s.slaText}
              onChange={(e) => setS({ ...s, slaText: e.target.value })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-foreground"
            checked={!!s.enabled}
            onChange={(e) => setS({ ...s, enabled: e.target.checked })}
          />
          Enabled
        </label>
        <Button
          type="button"
          size="sm"
          className="rounded-[10px]"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setErr(null);
            try {
              const next = await api<Settings>("/api/settings", {
                method: "PUT",
                body: JSON.stringify({
                  modelMain: s.modelMain,
                  retentionDays: s.retentionDays,
                  maxMessages: s.maxMessages,
                  autoOpenSeconds: s.autoOpenSeconds,
                  slaText: s.slaText,
                  enabled: s.enabled,
                }),
              });
              setS(next);
              toast("Settings saved");
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Save failed");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
