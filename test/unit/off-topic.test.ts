import { describe, expect, it } from "vitest";
import { isOffTopicUserText } from "../../src/pipeline.ts";

describe("isOffTopicUserText", () => {
  it("flags coding homework", () => {
    expect(isOffTopicUserText("python add numbers")).toBe(true);
    expect(
      isOffTopicUserText("Write a python function that adds two numbers"),
    ).toBe(true);
  });

  it("allows cloud migration FAQ", () => {
    expect(
      isOffTopicUserText("How does your cloud migration engagement work?"),
    ).toBe(false);
  });
});
