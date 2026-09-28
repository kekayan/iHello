import { describe, expect, it } from "vitest";
import { parseHandoffInput } from "../../src/tools.ts";

describe("parseHandoffInput", () => {
  it("parses optional phone and trims/caps length", () => {
    const long = "x" + "1".repeat(50);
    const parsed = parseHandoffInput({
      type: "lead",
      email: "a@b.co",
      phone: `  ${long}  `,
      summary: "want a pod",
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.phone).toBe(long.trim().slice(0, 40));
    expect(parsed!.phone!.length).toBe(40);
    expect(parsed!.email).toBe("a@b.co");
  });

  it("omits phone when missing or blank", () => {
    const a = parseHandoffInput({
      type: "support",
      summary: "help",
      phone: "   ",
    });
    expect(a!.phone).toBeUndefined();
    const b = parseHandoffInput({ type: "support", summary: "help" });
    expect(b!.phone).toBeUndefined();
  });
});
