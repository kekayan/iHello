export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(body || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.body && !(opts.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as T;
}

export function pct(n: number | undefined): string {
  return `${Math.round((n || 0) * 100)}%`;
}

export function ts(n: number | undefined | null): string {
  return n ? new Date(n).toLocaleString() : "—";
}

export type ModelOption = {
  id: string;
  label: string;
  group: "OpenAI" | "Anthropic" | "Workers AI";
  api: "messages" | "chat" | "responses";
  blurb: string;
};

export type ModelsResponse = {
  models: ModelOption[];
  default: string;
  small: string;
};

export type Settings = {
  enabled: boolean;
  greeting: string;
  suggestions: string[];
  placeholder: string;
  variants: Record<string, { greeting?: string; suggestions?: string[] }>;
  procedures: {
    identity: string;
    answering: string;
    lead: string;
    escalation: string;
  };
  modelMain: string;
  retentionDays: number;
  maxMessages: number;
  maxCharsPerMessage: number;
  autoOpenSeconds: number;
  slaText: string;
};

export type Metrics = {
  conversations7d: number;
  handoffs7d: number;
  conversion: number;
  unansweredRate: number;
};

export type Conversation = {
  id: string;
  visitor_id: string;
  page_url: string;
  referrer: string;
  handoff_id: string | null;
  started_at: number;
  last_message_at: number;
  message_count: number;
};

export type Message = {
  id: number;
  role: string;
  content: string;
  created_at: number;
  retrieval_score: number | null;
  grounded_score: number | null;
  grounded_commit: number | null;
};

export type Handoff = {
  id: string;
  type: string;
  email: string;
  name: string;
  company: string;
  pillar: string;
  timeline: string;
  scale: string;
  summary: string;
  page_url: string;
  status: string;
  created_at: number;
  conversation_id: string;
};

export type Gap = {
  question: string;
  score: number;
  page: string;
};

export type ActionPublic = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kind: "builtin" | "http" | "static" | "mcp";
  config: Record<string, unknown>;
  secretRef: string | null;
  hasSecret: boolean;
  confirmRequired: boolean;
  enabled: boolean;
  useCount: number;
  lastUsedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  builtin: boolean;
  updatedAt: number | null;
};

export type McpServerPublic = {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse";
  allowedTools: string[];
  secretRef: string | null;
  hasSecret: boolean;
  enabled: boolean;
  useCount: number;
  lastUsedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  updatedAt: number;
};

export type SecretPublic = {
  name: string;
  updatedAt: number;
  hasValue: true;
};

export const HANDOFF_STATUSES = ["new", "contacted", "scheduled", "closed"] as const;
