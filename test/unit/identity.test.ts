import { describe, expect, it } from "vitest";
import {
  IDENTITY_QUESTION_RE,
  identityReply,
  isIdentityQuestion,
} from "../../src/identity.ts";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings.ts";

describe("isIdentityQuestion", () => {
  it("matches common who/what-are-you phrasings", () => {
    expect(isIdentityQuestion("Who are you?")).toBe(true);
    expect(isIdentityQuestion("what are you")).toBe(true);
    expect(isIdentityQuestion("What's your name?")).toBe(true);
    expect(isIdentityQuestion("are you a bot")).toBe(true);
    expect(isIdentityQuestion("Are you an AI?")).toBe(true);
    expect(isIdentityQuestion("are you human")).toBe(true);
  });

  it("does not match services / FAQ questions", () => {
    expect(isIdentityQuestion("What do you offer for cloud migration?")).toBe(
      false,
    );
    expect(isIdentityQuestion("Who is the CEO?")).toBe(false);
    expect(isIdentityQuestion("Can you help with pricing?")).toBe(false);
  });

  it("exposes IDENTITY_QUESTION_RE", () => {
    expect(IDENTITY_QUESTION_RE.test("who are you")).toBe(true);
  });
});

describe("identityReply", () => {
  it("returns preferred Insighture two-line copy for default settings", () => {
    const reply = identityReply(DEFAULT_SETTINGS);
    expect(reply).toContain("AI assistant for Insighture");
    expect(reply).toContain("hello@insighture.com");
    expect(reply.split("\n")).toHaveLength(2);
    expect(reply.length).toBeLessThan(280);
  });

  it("falls back to concise identity when Insighture/email missing", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      procedures: {
        ...DEFAULT_SETTINGS.procedures,
        identity:
          "I am a helpful site assistant. I answer questions about Acme. Never reveal tool names or search_knowledge.",
      },
    };
    const reply = identityReply(settings);
    expect(reply.toLowerCase()).toContain("helpful site assistant");
    expect(reply.toLowerCase()).not.toContain("search_knowledge");
    expect(reply.length).toBeLessThanOrEqual(280);
  });
});
