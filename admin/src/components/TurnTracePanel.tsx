import type { TurnTrace } from "@/lib/api";
import type { ToolHop } from "@/lib/playground-chat";
import { cn } from "@/lib/utils";

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtOutput(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") {
    return value.length > 160 ? `${value.slice(0, 160)}…` : value;
  }
  try {
    const s = JSON.stringify(value);
    return s.length > 160 ? `${s.slice(0, 160)}…` : s;
  } catch {
    return String(value);
  }
}

type TraceRow = {
  key: string;
  label: string;
  ms: number;
  detail?: string;
  live?: boolean;
};

function rowsFromTrace(trace: TurnTrace): TraceRow[] {
  const rows: TraceRow[] = [];
  if (trace.refine_ms > 0) {
    rows.push({ key: "refine", label: "refine", ms: trace.refine_ms });
  }
  if (trace.retrieve_ms > 0) {
    rows.push({ key: "retrieve", label: "retrieve", ms: trace.retrieve_ms });
  }
  for (const g of trace.generate) {
    const tools =
      g.tool_names.length > 0 ? ` · tools ${g.tool_names.join(", ")}` : "";
    rows.push({
      key: `generate-${g.pass}`,
      label: `generate#${g.pass}`,
      ms: g.duration_ms,
      detail: g.ttft_ms > 0 ? `ttft ${fmtMs(g.ttft_ms)}${tools}` : tools || undefined,
    });
  }
  for (const t of trace.tools) {
    rows.push({
      key: `tool-${t.name}-${t.ms}`,
      label: `tool:${t.name}`,
      ms: t.ms,
      detail: t.detail,
    });
  }
  if (trace.validate_ms > 0) {
    rows.push({ key: "validate", label: "validate", ms: trace.validate_ms });
  }
  return rows;
}

function rowsFromToolHops(toolHops: ToolHop[]): TraceRow[] {
  return toolHops.map((h) => ({
    key: h.id,
    label: `tool:${h.name}`,
    ms: h.ms ?? 0,
    detail:
      h.input != null
        ? `in · ${fmtOutput(h.input)}`
        : h.output != null
          ? `out · ${fmtOutput(h.output)}`
          : undefined,
    live: !h.state.includes("result") && h.state !== "output-available",
  }));
}

export function TurnTracePanel({
  toolHops,
  trace,
  modelHint,
  streaming,
}: {
  toolHops: ToolHop[];
  trace?: TurnTrace | null;
  modelHint?: string;
  streaming?: boolean;
}) {
  const rows = trace ? rowsFromTrace(trace) : rowsFromToolHops(toolHops);
  const showSummary = trace != null;

  return (
    <aside className="surface flex min-h-[620px] flex-col overflow-hidden">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <p className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
          Turn log
        </p>
        <p className="mt-1 text-[12px] text-[var(--ink-3)]">
          Latency spans from the agent loop.
        </p>
        {modelHint ? (
          <p className="mt-1 truncate font-mono text-[10px] text-[var(--ink-3)]">
            {modelHint}
          </p>
        ) : null}
        {showSummary ? (
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px] tabular-nums">
            <div className="rounded-[8px] bg-[var(--paper-3)]/60 px-2 py-1.5">
              <p className="text-[var(--ink-3)] uppercase">Total</p>
              <p className="text-[12px] text-[var(--ink)]">
                {fmtMs(trace.total_ms)}
              </p>
            </div>
            <div className="rounded-[8px] bg-[var(--paper-3)]/60 px-2 py-1.5">
              <p className="text-[var(--ink-3)] uppercase">TTFT</p>
              <p className="text-[12px] text-[var(--ink)]">
                {fmtMs(trace.ttft_ms)}
              </p>
            </div>
            <div className="rounded-[8px] bg-[var(--paper-3)]/60 px-2 py-1.5">
              <p className="text-[var(--ink-3)] uppercase">Slowest</p>
              <p className="truncate text-[12px] text-[var(--ink)]">
                {trace.bottleneck || "—"}
              </p>
            </div>
          </div>
        ) : streaming ? (
          <p className="mt-2 font-mono text-[10px] text-[var(--signal-deep)]">
            Streaming… timing fills in when the turn completes.
          </p>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {rows.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-3)]">
            Send a message. refine, retrieve, generate, and tool spans appear
            here with millisecond timings.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] font-medium tracking-[0.04em] text-[var(--ink-3)] uppercase">
              Travel log
            </p>
            <div className="rounded-[10px] bg-[var(--paper-3)]/60 px-3 py-2">
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[1fr_auto] gap-2 border-b border-[var(--line)]/60 py-2 font-mono text-[11px] last:border-0"
                >
                  <div className="min-w-0">
                    <span
                      className={cn(
                        row.live
                          ? "text-[var(--signal-deep)]"
                          : "text-[var(--ink)]",
                      )}
                    >
                      • {row.label}
                    </span>
                    {row.detail ? (
                      <p className="mt-0.5 truncate text-[var(--ink-3)]">
                        {row.detail}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 tabular-nums text-[var(--ink-3)]">
                    {row.live && row.ms <= 0 ? "…" : fmtMs(row.ms)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
