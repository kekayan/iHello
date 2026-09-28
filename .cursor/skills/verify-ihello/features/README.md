# iHello verification map

This directory is the maintained source for verifying user-facing behaviour of iHello (site-chat-agent ChatAgent + embed). Read the index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- Prefer live `https://site-chat-agent.kekayanlabs.workers.dev` with `Cf-Access-Jwt-Assertion: bench-bypass`.
- Or local `wrangler dev` on `:8787` with `IHELLO_HTTP_BASE` / `IHELLO_WS_BASE` pointed at it.
- Run `bash helpers/doctor.sh` and require HTTP 200 from `/config`.
- Drive with `node helpers/ws-turn.mjs` using a fresh `verify_*` conversation each run.
- Do not wipe D1, Vectorize, or Behaviour settings during verification.

## Driving conventions

- Start every recipe from a new conversation unless the feature is explicitly multi-turn on one `convId` (the helper keeps one WS/conv for `--turns`).
- Treat queries and expected decline strings as literal (ASCII hyphen in the off-topic decline).
- Exit code of `ws-turn.mjs` must be `0` and evidence text non-empty before claiming success.
- Record the feature ID in the `--out` filename under `evidence/`.

## Proof and skip reporting

- Capture the query and the resulting assistant text (and `data-follow-ups` when the feature expects chips).
- Side effects that matter: decline text exactness, presence/absence of follow-ups, handoff language after email, `embed.js` body markers.
- Report an unreachable path with the doctor/WS error; do not mark it verified via a different path.

## Feature entry contract

Each feature file starts with an H1 and one paragraph of user-visible behaviour, then exactly these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with ws-turn`, `Gotchas`.

## Features

| ID | File | What it proves |
|---|---|---|
| `faq-services` | [faq-services.md](./faq-services.md) | Cloud migration FAQ → search + grounded answer + chips |
| `off-topic-decline` | [off-topic-decline.md](./off-topic-decline.md) | Coding homework declined with exact gate string; no chips |
| `handoff-lead` | [handoff-lead.md](./handoff-lead.md) | Multi-turn buying intent + email → lead handoff |
| `follow-up-chips` | [follow-up-chips.md](./follow-up-chips.md) | Services FAQ emits `data-follow-ups` suggestions |
| `embed-widget` | [embed-widget.md](./embed-widget.md) | Served `embed.js` size + required protocol symbols |
