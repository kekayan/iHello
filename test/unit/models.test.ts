import { describe, expect, it } from "vitest";
import { modelApiFor, resolveModelId } from "../../src/models.ts";

describe("modelApiFor", () => {
  it("maps luna → responses, grok → chat, anthropic → messages", () => {
    expect(modelApiFor(resolveModelId("luna", "x"))).toBe("responses");
    expect(modelApiFor(resolveModelId("grok", "x"))).toBe("chat");
    expect(modelApiFor(resolveModelId("anthropic/claude-sonnet-5", "x"))).toBe(
      "messages",
    );
  });
});

describe("resolveModelId", () => {
  it("resolves aliases", () => {
    expect(resolveModelId("luna", "fallback")).toBe("openai/gpt-5.6-luna");
    expect(resolveModelId("grok", "fallback")).toBe("xai/grok-4.6");
    expect(resolveModelId("grok-fast", "fallback")).toBe(
      "xai/grok-4.20-0309-non-reasoning",
    );
    expect(resolveModelId("claude-sonnet-5", "fallback")).toBe(
      "anthropic/claude-sonnet-5",
    );
    expect(resolveModelId("", "xai/grok-4.6")).toBe("xai/grok-4.6");
  });
});
