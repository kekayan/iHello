import { describe, expect, it } from "vitest";
import {
  assembleSystemPrompt,
  DEFAULT_RUNTIME_LOOP,
  DEFAULT_TOOL_POLICY,
  DEFAULT_UNCERTAINTY,
} from "../../src/system-prompt.ts";
import { DEFAULT_SETTINGS } from "../../src/settings.ts";
import { WRITING_STYLE_RULES } from "../../src/text-style.ts";
import { buildSystemPrompt } from "../../src/pipeline.ts";

describe("assembleSystemPrompt", () => {
  it("emits labelled section headers in order", () => {
    const out = assembleSystemPrompt({
      procedures: DEFAULT_SETTINGS.procedures,
      slaText: "within one business day",
      context: "",
      pageUrl: "https://example.com/services",
    });
    for (const h of [
      "# Identity",
      "# Answering",
      "# Writing style",
      "# Tool policy",
      "# Uncertainty",
      "# Lead",
      "# Escalation",
      "# Examples",
      "# Runtime",
    ]) {
      expect(out).toContain(h);
    }
    expect(out.indexOf("# Identity")).toBeLessThan(out.indexOf("# Answering"));
    expect(out.indexOf("# Tool policy")).toBeLessThan(out.indexOf("# Lead"));
    expect(out).toContain(WRITING_STYLE_RULES);
    expect(out).toContain("Page: https://example.com/services.");
    expect(out).toContain("within one business day");
  });

  it("falls back to DEFAULT_* when tool_policy/uncertainty empty", () => {
    const out = assembleSystemPrompt({
      procedures: {
        ...DEFAULT_SETTINGS.procedures,
        tool_policy: "  ",
        uncertainty: "",
        examples: "",
      },
      slaText: "soon",
    });
    expect(out).toContain(DEFAULT_TOOL_POLICY);
    expect(out).toContain(DEFAULT_UNCERTAINTY);
    expect(out).toContain(DEFAULT_RUNTIME_LOOP);
    expect(out).not.toContain("# Examples");
  });

  it("wraps non-empty context in site_context", () => {
    const out = assembleSystemPrompt({
      procedures: DEFAULT_SETTINGS.procedures,
      slaText: "soon",
      context: "Pods deliver in two-week slices.",
    });
    expect(out).toContain("<site_context>");
    expect(out).toContain("Pods deliver in two-week slices.");
    expect(out).not.toContain(DEFAULT_RUNTIME_LOOP);
  });
});

describe("buildSystemPrompt", () => {
  it("delegates to assembleSystemPrompt", () => {
    const viaBuild = buildSystemPrompt({
      settings: DEFAULT_SETTINGS,
      context: "",
      pageUrl: "https://example.com/",
      pillar: null,
    });
    const viaAssemble = assembleSystemPrompt({
      procedures: DEFAULT_SETTINGS.procedures,
      slaText: DEFAULT_SETTINGS.slaText,
      context: "",
      pageUrl: "https://example.com/",
    });
    expect(viaBuild).toBe(viaAssemble);
    expect(viaBuild).toContain("# Identity");
  });
});
