import { describe, expect, it } from "vitest";
import {
  chunkText,
  hitsToContext,
  splitTextIntoParts,
  type VzHit,
} from "../../src/vectorize-rag";
import { MAX_CHARS } from "../../src/fetch-page";

describe("MAX_CHARS", () => {
  it("allows up to 1M extracted chars", () => {
    expect(MAX_CHARS).toBe(1_000_000);
  });
});

describe("splitTextIntoParts", () => {
  it("returns single part when under target", () => {
    expect(splitTextIntoParts("hello\n\nworld", 100)).toEqual(["hello\n\nworld"]);
  });

  it("splits on paragraph boundaries near target", () => {
    const a = "A".repeat(80);
    const b = "B".repeat(80);
    const c = "C".repeat(80);
    const text = `${a}\n\n${b}\n\n${c}`;
    const parts = splitTextIntoParts(text, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(text);
    // No silent loss
    expect(parts.reduce((n, p) => n + p.length, 0)).toBe(text.length);
  });

  it("prefers heading breaks", () => {
    const body = "x".repeat(90);
    const text = `${body}\n# Next\n${body}`;
    const parts = splitTextIntoParts(text, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.some((p) => p.startsWith("# Next") || p.includes("\n# Next"))).toBe(
      true,
    );
  });
});

describe("chunkText", () => {
  it("chunks long text without loss beyond overlap semantics", () => {
    const text = "word ".repeat(500);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.length).toBeLessThanOrEqual(900);
  });
});

describe("hitsToContext", () => {
  it("prepends Source url or source_key", () => {
    const hits: VzHit[] = [
      {
        id: "1",
        score: 0.9,
        text: "alpha",
        source_key: "doc.md",
        source_url: "https://example.com/page",
      },
      {
        id: "2",
        score: 0.8,
        text: "beta",
        source_key: "other.md",
      },
    ];
    const { context, topScore } = hitsToContext(hits);
    expect(topScore).toBe(0.9);
    expect(context).toContain("Source: https://example.com/page\nalpha");
    expect(context).toContain("Source: other.md\nbeta");
  });
});
