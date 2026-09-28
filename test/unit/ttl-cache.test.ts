import { describe, expect, it } from "vitest";
import {
  SETTINGS_CACHE_TTL_MS,
  ttlGet,
  ttlSet,
} from "../../src/ttl-cache.ts";

describe("ttl cache", () => {
  it("uses 45s TTL constant", () => {
    expect(SETTINGS_CACHE_TTL_MS).toBe(45_000);
  });

  it("returns value within TTL and null after expiry", () => {
    const now = 1_000_000;
    const entry = ttlSet({ ok: true }, now, SETTINGS_CACHE_TTL_MS);
    expect(ttlGet(entry, now)).toEqual({ ok: true });
    expect(ttlGet(entry, now + SETTINGS_CACHE_TTL_MS - 1)).toEqual({
      ok: true,
    });
    expect(ttlGet(entry, now + SETTINGS_CACHE_TTL_MS)).toBeNull();
    expect(ttlGet(null, now)).toBeNull();
  });
});
