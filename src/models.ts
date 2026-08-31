/** Models available through Cloudflare AI Gateway (Unified Billing / Workers AI). */

export type ModelApi = "messages" | "chat" | "responses";

export type ModelOption = {
  id: string;
  label: string;
  group: "OpenAI" | "Anthropic" | "Workers AI";
  api: ModelApi;
  blurb: string;
};

/** Canonical catalog shown in admin Settings. */
export const MODEL_CATALOG: readonly ModelOption[] = [
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
  luna: "openai/gpt-5.6-luna",
  sol: "openai/gpt-5.6-sol",
  terra: "openai/gpt-5.6-terra",
  tara: "openai/gpt-5.6-terra",
  "glm-5.3-flash": "@cf/zai-org/glm-5.3-flash",
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
  if (modelId.startsWith("@cf/")) return "chat";
  return "chat";
}

export function isWorkersAiModel(modelId: string): boolean {
  return modelId.startsWith("@cf/");
}
