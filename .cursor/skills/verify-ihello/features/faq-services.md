# FAQ — services / cloud migration

A visitor asking what the company offers for cloud migration gets a knowledge-backed answer (agent calls `search_knowledge`) and, after the reply, follow-up chips — not a handoff or an invented timeline.

## Sub-features

- `faq-migration-query` accepts a natural-language migration/modernisation question.
- `faq-search-then-answer` answers from retrieved site knowledge (tool path), not hardcoded timelines.
- `faq-follow-up-chips` attaches post-reply suggestions after a successful FAQ turn.

## How to get to it (user POV)

- Open the site embed widget (hello.kekayan.com) or Admin Playground and type a services question about cloud migration / modernisation.
- Same path over the verification WS helper without the UI.

## Driving it with ws-turn

Preconditions:

- `bash helpers/doctor.sh` exits 0 against the target base.
- Knowledge backend has synced chunks (thin/empty Vectorize after a D1 wipe will yield weak answers — re-sync before blaming the agent loop).

- **Migration FAQ.** Ask about cloud migration offerings. Run `node helpers/ws-turn.mjs --query "What do you offer for cloud migration?" --out evidence/faq-services.json`. Expect exit `0`, non-empty `text`, evidence `tools` / activity showing search, and no lead-handoff-only reply.
- **Answer substance.** The assistant text should discuss migration/modernisation services or delivery pods grounded in site knowledge — not invent a fixed "4 weeks" mobilisation fact and not write code.
- **Chips.** The same turn should usually include `followUps` (array of suggestion strings) from `data-follow-ups`. If chips are missing, treat as incomplete for this feature (see also `follow-up-chips`).
- **Proof.** Keep `evidence/faq-services.json` with `convId`, full `text`, `tools`, and `followUps`.

## Gotchas

- Sticky `cw_conv` / DO reuse in the browser can replay prior replies; the helper always uses a fresh `verify_*` id — prefer it over the widget when proving Behaviour changes.
- FAQ latency is often 3–6s TTFT; raise `IHELLO_TIMEOUT_MS` if the default 60s wall is tight on cold starts.
- Empty Vectorize / wiped `vz_chunks` metadata makes answers thin; that is a data precondition failure, not necessarily an agent-loop bug.
- Do not assert the stale "4 weeks" persona string — site facts live in knowledge, not procedures.
