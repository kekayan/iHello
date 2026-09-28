import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, proceduresForPreset } from "../../src/settings.ts";

describe("DEFAULT_SETTINGS", () => {
  it("bakes gpt-5.6-luna main model", () => {
    expect(DEFAULT_SETTINGS.modelMain).toBe(
      "openai/gpt-5.6-luna",
    );
  });

  it("answering procedure declines coding", () => {
    const a = DEFAULT_SETTINGS.procedures.answering.toLowerCase();
    expect(a).toMatch(/coding/);
    expect(a).toMatch(/decline/);
  });

  it("includes tool_policy, uncertainty, and examples", () => {
    const p = DEFAULT_SETTINGS.procedures;
    expect(p.tool_policy.length).toBeGreaterThan(20);
    expect(p.uncertainty.toLowerCase()).toMatch(/human|guess/);
    expect(p.examples.toLowerCase()).toMatch(/search_knowledge|handoff/);
  });

  it("proceduresForPreset preserves new procedure fields", () => {
    const lead = proceduresForPreset("Lead-gen");
    const support = proceduresForPreset("Support");
    expect(lead.tool_policy).toBe(DEFAULT_SETTINGS.procedures.tool_policy);
    expect(support.examples).toBe(DEFAULT_SETTINGS.procedures.examples);
    expect(support.uncertainty).toBe(DEFAULT_SETTINGS.procedures.uncertainty);
  });

  it("identity names Insighture and keeps who-are-you short", () => {
    const id = DEFAULT_SETTINGS.procedures.identity;
    expect(id).toMatch(/Insighture/);
    expect(id.toLowerCase()).toContain("hello@insighture.com");
    expect(id.toLowerCase()).toContain("virtual concierge");
    expect(id).toContain('Speak as "I"');
  });

  it("lead collects email and mobile", () => {
    const lead = DEFAULT_SETTINGS.procedures.lead.toLowerCase();
    expect(lead).toContain("email");
    expect(lead).toMatch(/mobile|phone/);
    expect(lead).toContain("at most two");
  });

  it("examples include Insighture who-are-you reply and email+mobile", () => {
    const ex = DEFAULT_SETTINGS.procedures.examples;
    expect(ex).toContain("AI assistant for Insighture");
    expect(ex.toLowerCase()).toMatch(/email and mobile|\+ phone/);
  });

  it("answering skips search on identity questions", () => {
    const a = DEFAULT_SETTINGS.procedures.answering.toLowerCase();
    expect(a).toMatch(/who-are-you|identity/);
    expect(a).toContain("do not call search_knowledge");
  });

});
