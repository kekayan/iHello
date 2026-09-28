/** Per-turn latency / bottleneck diagnostics stored on assistant messages. */

export type TraceToolSpan = {
  name: string;
  ms: number;
  ok: boolean;
  detail?: string;
};

export type TraceGenerateSpan = {
  pass: number;
  duration_ms: number;
  ttft_ms: number;
  tool_names: string[];
};

export type TurnTrace = {
  model: string;
  intent: string;
  reasoning_effort: string;
  page_url: string;
  refine_ms: number;
  retrieve_ms: number;
  generate: TraceGenerateSpan[];
  tools: TraceToolSpan[];
  validate_ms: number;
  /** First visible token after turn start (best-effort). */
  ttft_ms: number;
  /** End-to-end turn time excluding afterTurn persistence. */
  total_ms: number;
  bottleneck: string;
};

export function emptyTurnTrace(partial: Partial<TurnTrace> & Pick<TurnTrace, "model" | "intent">): TurnTrace {
  return {
    model: partial.model,
    intent: partial.intent,
    reasoning_effort: partial.reasoning_effort ?? "",
    page_url: partial.page_url ?? "",
    refine_ms: partial.refine_ms ?? 0,
    retrieve_ms: partial.retrieve_ms ?? 0,
    generate: partial.generate ?? [],
    tools: partial.tools ?? [],
    validate_ms: partial.validate_ms ?? 0,
    ttft_ms: partial.ttft_ms ?? 0,
    total_ms: partial.total_ms ?? 0,
    bottleneck: partial.bottleneck ?? "",
  };
}

export function findBottleneck(trace: TurnTrace): string {
  const candidates: Array<{ name: string; ms: number }> = [
    { name: "refine", ms: trace.refine_ms },
    { name: "retrieve", ms: trace.retrieve_ms },
    ...trace.generate.map((g) => ({
      name: `generate#${g.pass}`,
      ms: g.duration_ms,
    })),
    ...trace.tools.map((t) => ({ name: `tool:${t.name}`, ms: t.ms })),
    { name: "validate", ms: trace.validate_ms },
  ];
  let best = candidates[0] ?? { name: "unknown", ms: 0 };
  for (const c of candidates) {
    if (c.ms > best.ms) best = c;
  }
  return best.name;
}

export function parseTurnTrace(raw: unknown): TurnTrace | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.total_ms !== "number") return null;
  return value as TurnTrace;
}
