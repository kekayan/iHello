import { describe, expect, it } from "vitest";
import { normalizeFollowUps } from "../../src/pipeline.ts";

describe("normalizeFollowUps", () => {
  it("keeps 2–3 unique short chips", () => {
    expect(
      normalizeFollowUps(["AI adoption", "Cloud migration", "Pods", "Extra"]),
    ).toEqual(["AI adoption", "Cloud migration", "Pods"]);
  });

  it("uses fallback when fewer than 2", () => {
    expect(
      normalizeFollowUps(["Only one"], ["Fallback A", "Fallback B", "C"]),
    ).toEqual(["Fallback A", "Fallback B", "C"]);
  });

  it("accepts { suggestions } objects", () => {
    expect(
      normalizeFollowUps(
        { suggestions: ["One", "Two"] },
        ["fb1", "fb2"],
      ),
    ).toEqual(["One", "Two"]);
  });
});
