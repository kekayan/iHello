import type { UIMessage } from "ai";

export function toolActivityLabel(toolName: string): string {
  switch (toolName) {
    case "search_knowledge":
      return "Searching for relevant information…";
    case "book_meeting":
      return "Finding booking link…";
    case "handoff":
      return "Recording your details…";
    default:
      return "Working…";
  }
}

function textFromUiMessage(message: UIMessage | undefined): string {
  return (message?.parts ?? [])
    .filter(
      (p): p is { type: "text"; text: string } =>
        p.type === "text" && typeof (p as { text?: string }).text === "string",
    )
    .map((p) => p.text)
    .join("");
}

function isToolDone(state: string): boolean {
  return state.includes("result") || state === "output-available";
}

/** Live status for the in-flight assistant bubble. */
export function deriveAssistantActivity(
  messages: UIMessage[],
  status: string,
  activityHint?: string | null,
): string | null {
  if (status !== "submitted" && status !== "streaming") return null;

  const last = messages.at(-1);
  const assistant =
    last?.role === "assistant"
      ? last
      : [...messages].reverse().find((m) => m.role === "assistant");

  if (assistant && textFromUiMessage(assistant).trim()) return null;

  if (assistant) {
    for (const part of assistant.parts ?? []) {
      const type = part.type;
      if (type === "reasoning") return "Thinking…";
      if (typeof type === "string" && type.startsWith("reasoning-")) {
        return "Thinking…";
      }
      if (typeof type === "string" && (type.startsWith("tool-") || type === "dynamic-tool")) {
        const p = part as { toolName?: string; state?: string; type: string };
        const name = p.toolName || type.replace(/^tool-/, "");
        const state = p.state || "";
        if (!isToolDone(state)) return toolActivityLabel(name);
      }
    }
  }

  if (activityHint) return activityHint;
  if (status === "submitted") return "Searching for relevant information…";
  if (status === "streaming") return "Thinking…";
  return null;
}
