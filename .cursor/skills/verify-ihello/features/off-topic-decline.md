# Off-topic decline

Coding and homework asks are refused by the cheap off-topic gate before the agent loop. The visitor sees a fixed decline string and is steered back to services; no follow-up chips.

## Sub-features

- `decline-coding` refuses "write python / add two numbers" style asks.
- `decline-exact-copy` returns the canonical `DECLINE_OFF_TOPIC` string (ASCII hyphen).
- `decline-no-follow-ups` skips `data-follow-ups` on declined turns.

## How to get to it (user POV)

- In the embed or Playground, ask the assistant to write or run code unrelated to company services (e.g. add two numbers in Python).
- Same ask via `ws-turn`.

## Driving it with ws-turn

Preconditions:

- Doctor is green on the target.
- Live Behaviour still includes the off-topic gate (version that ships `OFF_TOPIC_RE` / answering steer).

- **Coding ask.** Run `node helpers/ws-turn.mjs --query "Write a python function that adds two numbers" --out evidence/off-topic-decline.json`.
- **Exact decline.** Assistant `text` must equal (or clearly be) `That's outside what I can help with here - ask me about our services or delivery pods.` — **ASCII hyphen** between `here` and `ask`, not an em dash.
- **No chips.** `followUps` must be `null` / absent; evidence events must not include useful `data-follow-ups` suggestions.
- **No code.** Text must not contain a Python function body or solution to the homework.
- **Proof.** Save `evidence/off-topic-decline.json` showing query, exact text, and empty follow-ups.

## Gotchas

- Personas may still list an em-dash variant or pizza-only off-topic — those are stale. Assert the pipeline constant with ASCII `-`.
- If the model answers with Python, the gate regressed or was bypassed; that is `NOT VERIFIED`, not "close enough".
- Abuse/injection declines use a different string (`DECLINE_ABUSE`); do not mix them up with this feature.
