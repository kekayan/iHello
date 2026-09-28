/**
 * One-off reclamation of Durable Object storage left behind by earlier versions
 * of the widget (throwaway `idle-*` playground objects, probes, and pre-swap
 * conversations still carrying the old harness's tables).
 *
 * Enumeration has to go through the REST API: orphaned objects never completed
 * a turn, so D1 has no row for them and their names cannot be reconstructed.
 * Ongoing cleanup does not use this path — objects arm their own expiry
 * schedule in `ChatAgent.armExpiry`.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

/** Bounded fan-out per wave; each destroy is one Cloudflare-service subrequest. */
const WAVE = 25;

const MIN_PAGE = 10;
const MAX_PAGE = 1000;

type CfEnvelope<T> = {
  success: boolean;
  errors?: { message: string }[];
  result?: T;
  result_info?: { cursor?: string; total_count?: number };
};

type CfNamespace = { id: string; class?: string; script?: string };

type CfObject = { id?: string; hasStoredData?: boolean };

export type PurgeResult = {
  scanned: number;
  destroyed: number;
  failed: number;
  cursor: string | null;
  done: boolean;
};

async function cfGet<T>(env: Env, path: string): Promise<CfEnvelope<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}` },
  });
  const body = (await res.json()) as CfEnvelope<T>;
  if (!res.ok || !body.success) {
    const detail =
      body.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Cloudflare API: ${detail}`);
  }
  return body;
}

async function findNamespaceId(env: Env): Promise<string> {
  const page = await cfGet<CfNamespace[]>(
    env,
    `/accounts/${env.CF_ACCOUNT_ID}/workers/durable_objects/namespaces`,
  );
  const hit = (page.result ?? []).find((n) => n.class === "ChatAgent");
  if (!hit) {
    throw new Error("No Durable Object namespace found for class ChatAgent.");
  }
  return hit.id;
}

/**
 * Destroys one page of objects and returns the cursor for the next page.
 * Callers loop until `done`, which keeps each invocation inside the free plan's
 * 1,000 Cloudflare-service subrequests.
 */
export async function purgeObjects(
  env: Env,
  opts: { cursor?: string; limit?: number; dryRun?: boolean },
): Promise<PurgeResult> {
  const nsId = await findNamespaceId(env);
  const limit = Math.min(Math.max(opts.limit ?? 200, MIN_PAGE), MAX_PAGE);
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.cursor) params.set("cursor", opts.cursor);

  const page = await cfGet<CfObject[]>(
    env,
    `/accounts/${env.CF_ACCOUNT_ID}/workers/durable_objects/namespaces/${nsId}/objects?${params}`,
  );
  const ids = (page.result ?? [])
    .filter((o): o is { id: string; hasStoredData?: boolean } => Boolean(o.id))
    .filter((o) => o.hasStoredData !== false)
    .map((o) => o.id);
  const cursor = page.result_info?.cursor || null;

  if (opts.dryRun) {
    return { scanned: ids.length, destroyed: 0, failed: 0, cursor, done: !cursor };
  }

  let destroyed = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += WAVE) {
    const wave = await Promise.allSettled(
      ids.slice(i, i + WAVE).map((id) => {
        const stub = env.ChatAgent.get(env.ChatAgent.idFromString(id));
        return stub.purge();
      }),
    );
    for (const r of wave) {
      // destroy() wipes storage and then aborts the isolate, so a successful
      // purge surfaces to the caller as a rejected RPC. Re-run with dryRun to
      // confirm the objects are actually gone.
      if (r.status === "fulfilled") destroyed++;
      else failed++;
    }
  }

  return { scanned: ids.length, destroyed, failed, cursor, done: !cursor };
}
