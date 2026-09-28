---
name: verify-ihello
description: "Verify iHello (Cloudflare Worker ChatAgent + embed widget) over live or local WebSocket: FAQ answers, off-topic declines, lead handoffs, follow-up chips, and embed.js integrity. Use when proving site-chat-agent behaviour, after Behaviour/tool/embed changes, or before claiming a chat fix is live."
---

# Verify iHello

Drive the real ChatAgent Durable Object the way the embed widget does: open a WebSocket, send `cf_agent_use_chat_request`, collect streamed `text-delta` / `data-follow-ups` / `done`, and keep JSON evidence. Prefer the live Worker; use local `wrangler dev` only when the change is not yet deployed.

## Launch

**Prefer live (default):**

- HTTP: `https://site-chat-agent.kekayanlabs.workers.dev`
- WS: `wss://site-chat-agent.kekayanlabs.workers.dev/agents/chat-agent/<convId>`
- Access header on every request/WS: `Cf-Access-Jwt-Assertion: bench-bypass`
- Optional page URL for visit metadata: `https://hello.kekayan.com/`

Ready when `bash helpers/doctor.sh` exits 0 (GET `/config` → 200).

**Local alternative:**

```bash
cd /Users/kekayan/InsightureHello   # or the checkout with wrangler.jsonc
npx wrangler dev --port 8787
```

Then point helpers at local:

```bash
export IHELLO_HTTP_BASE=http://127.0.0.1:8787
export IHELLO_WS_BASE=ws://127.0.0.1:8787
# Access header still sent; local usually ignores it
```

Ready when doctor against `$IHELLO_HTTP_BASE` returns 200. Tear down local by stopping the wrangler process you started (never kill by process name).

## Doctor

Read-only reachability check before any drive:

```bash
bash .cursor/skills/verify-ihello/helpers/doctor.sh
# or from this skill root:
bash helpers/doctor.sh
```

Requires HTTP 200 from `$IHELLO_HTTP_BASE/config` (default live workers.dev) with `Cf-Access-Jwt-Assertion: $IHELLO_ACCESS` (default `bench-bypass`). Prints status and a short body snippet; exits non-zero on failure.

## Drive

Node ESM helper using the Agents SDK chat protocol:

```bash
# Single turn
node helpers/ws-turn.mjs --query "What do you offer for cloud migration?" \
  --out .cursor/skills/verify-ihello/evidence/faq-services.json

# Multi-turn (JSON array)
node helpers/ws-turn.mjs --turns '["We need a consultant for cloud migration","Please connect us — my email is verify-lead@example.com"]' \
  --out .cursor/skills/verify-ihello/evidence/handoff-lead.json

# FAQ smoke with span summary (data-turn-trace + stderr span-summary)
node helpers/ws-turn.mjs --trace --query "What do you offer for cloud migration?" \
  --out .cursor/skills/verify-ihello/evidence/faq-services.json
```

Env knobs:

| Env | Default |
|---|---|
| `IHELLO_WS_BASE` | `wss://site-chat-agent.kekayanlabs.workers.dev` |
| `IHELLO_ACCESS` | `bench-bypass` |
| `IHELLO_PAGE_URL` | `https://hello.kekayan.com/` |
| `IHELLO_TIMEOUT_MS` | `60000` |
| `IHELLO_HTTP_BASE` | `https://site-chat-agent.kekayanlabs.workers.dev` (doctor only) |
| `IHELLO_TRACE` | unset; set `1` (or pass `--trace`) to request `data-turn-trace` and print span summary |

Each run opens a **fresh** conversation `verify_<uuid>`, sends `cf_agent_use_chat_request`, and collects `text-delta`, `data-follow-ups`, tool/activity events, `error`, and `done`. Prints `{ summary, evidence }` JSON to stdout. Exit `0` only if every turn is `done`, has no error, and produced non-empty text.

## Evidence

Write proof JSON under:

```text
.cursor/skills/verify-ihello/evidence/<feature-id>.json
```

(When working from a box copy of this skill, the same relative `evidence/` directory next to `SKILL.md` is fine.)

Each file should include `at`, `wsBase`, `convId`, `pageUrl`, and per-turn `query` / `text` / `followUps` / `tools` / `done` / `error`. Capture the user action (the query) and the resulting assistant text (and chips when expected), not only a pass/fail bit. Prefer a fresh `verify_*` convId so sticky DO history cannot fake success.

## Cleanup

- Close the WebSocket (the helper does this).
- Stop any local `wrangler dev` you started for the run.
- **Keep** evidence JSON — never delete proof artifacts in cleanup.
- **Never wipe D1** (`chat_agent`), Vectorize, or live Behaviour/settings as part of verification cleanup. Disposable state is the `verify_*` conversation only; leave production data alone.

## Helpers

| Helper | Invoke | Purpose |
|---|---|---|
| `helpers/doctor.sh` | `bash helpers/doctor.sh` | GET `/config` with Access header; require 200 |
| `helpers/ws-turn.mjs` | `node helpers/ws-turn.mjs --query "..." [--out path]` | One or more WS chat turns; JSON evidence; exit 0 on success |

Callers use `bash` and `node` explicitly (no chmod/shebang reliance). The `ws` package must be resolvable (run from the InsightureHello tree, or ensure `node_modules/ws` is on the module path).

## Feature map

See [features/README.md](features/README.md) for the index, then the feature file for the claim under test. A proof that drives one convenient query is incomplete when the map lists other entry points for that feature.
