/** Tiny in-memory TTL entry helpers for Durable Object instance caches. */

export const SETTINGS_CACHE_TTL_MS = 45_000;

export type TtlEntry<T> = {
  value: T;
  expiresAt: number;
};

/** Return cached value if still fresh; otherwise null. */
export function ttlGet<T>(
  entry: TtlEntry<T> | null | undefined,
  now: number,
): T | null {
  if (!entry) return null;
  if (now >= entry.expiresAt) return null;
  return entry.value;
}

export function ttlSet<T>(
  value: T,
  now: number,
  ttlMs: number = SETTINGS_CACHE_TTL_MS,
): TtlEntry<T> {
  return { value, expiresAt: now + ttlMs };
}
