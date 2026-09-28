/** Models available through Cloudflare AI Gateway (Unified Billing / Workers AI). */

export type ModelApi = "messages" | "chat" | "responses";

export type ModelOption = {
  id: string;
  label: string;
  group: "xAI" | "OpenAI" | "Anthropic" | "Workers AI";
  api: ModelApi;
  blurb: string;
};

/** Canonical catalog shown in admin Settings. */
export const MODEL_CATALOG: readonly ModelOption[] = [
  {
    id: "xai/grok-4.6",
    label: "Grok 4.6",
    group: "xAI",
    api: "chat",
    blurb: "Flagship · always reasons (use Reasoning effort in Settings)",
  },
  {
    id: "xai/grok-4.20-0309-non-reasoning",
    label: "Grok 4.20 Fast",
    group: "xAI",
    api: "chat",
    blurb: "No thinking trace · streams sooner",
  },
  {
    id: "openai/gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    group: "OpenAI",
    api: "responses",
    blurb: "Cost-sensitive GPT-5.6",
  },
  {
    id: "openai/gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    group: "OpenAI",
    api: "responses",
    blurb: "Frontier GPT-5.6",
  },
  {
    id: "openai/gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    group: "OpenAI",
    api: "responses",
    blurb: "Balanced GPT-5.6",
  },
  {
    id: "anthropic/claude-sonnet-5",
    label: "Claude Sonnet 5",
    group: "Anthropic",
    api: "messages",
    blurb: "Default agentic Sonnet",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    group: "Anthropic",
    api: "messages",
    blurb: "Strong coding Sonnet",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    group: "Anthropic",
    api: "messages",
    blurb: "Fast / cheap Anthropic",
  },
  {
    id: "anthropic/claude-opus-4.5",
    label: "Claude Opus 4.5",
    group: "Anthropic",
    api: "messages",
    blurb: "Highest Anthropic quality",
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B Fast",
    group: "Workers AI",
    api: "chat",
    blurb: "Workers AI · FP8 instruct · good balance of speed and quality",
  },
  {
    id: "@cf/zai-org/glm-5.3-flash",
    label: "GLM 5.3 Flash",
    group: "Workers AI",
    api: "chat",
    blurb: "Z.ai multimodal flash",
  },
] as const;

const LEGACY_ALIASES: Record<string, string> = {
  "claude-sonnet-5": "anthropic/claude-sonnet-5",
  "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
  "claude-haiku-4.5": "anthropic/claude-haiku-4.5",
  // User shorthand
  grok: "xai/grok-4.6",
  "grok-4.6": "xai/grok-4.6",
  "grok-fast": "xai/grok-4.20-0309-non-reasoning",
  luna: "openai/gpt-5.6-luna",
  sol: "openai/gpt-5.6-sol",
  terra: "openai/gpt-5.6-terra",
  tara: "openai/gpt-5.6-terra",
  "glm-5.3-flash": "@cf/zai-org/glm-5.3-flash",
  "llama-3.3-70b": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "llama-70b-fast": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
};

export function resolveModelId(raw: string | undefined | null, fallback: string): string {
  const trimmed = (raw || "").trim();
  const key = trimmed || fallback;
  return LEGACY_ALIASES[key] || LEGACY_ALIASES[key.toLowerCase()] || key;
}

export function modelApiFor(modelId: string): ModelApi {
  const hit = MODEL_CATALOG.find((m) => m.id === modelId);
  if (hit) return hit.api;
  if (modelId.startsWith("openai/gpt-5.6-")) return "responses";
  if (modelId.startsWith("anthropic/") || !modelId.includes("/")) return "messages";
  if (modelId.startsWith("xai/") || modelId.startsWith("@cf/")) return "chat";
  return "chat";
}

/** Grok 4.5 / 4.6 only — 4.20 rejects reasoning_effort with a 400. */
export function supportsReasoningEffort(modelId: string): boolean {
  return /xai\/grok-4\.[56]/.test(modelId);
}