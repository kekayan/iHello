# Follow-up chips

After a normal services FAQ reply, the Worker emits a `data-follow-ups` payload so the embed can render suggestion chips. Declines skip chips.

## Sub-features

- `chips-emit` sends `data-follow-ups` with suggestion strings after a successful FAQ answer.
- `chips-render-contract` suggestions are a non-empty list suitable for chip buttons.
- `chips-skip-on-decline` off-topic declines do not emit follow-ups (cross-check `off-topic-decline`).

## How to get to it (user POV)

- Ask a services FAQ in the embed; after the assistant finishes, floating chips appear over the thread.
- Observe the same WS event via `ws-turn` without the UI.

## Driving it with ws-turn

Preconditions:

- Doctor is green.
- Prefer a migration/services FAQ that is not declined.

- **Services FAQ → chips.** Run `node helpers/ws-turn.mjs --query "What do you offer for cloud migration?" --out evidence/follow-up-chips.json`.
- **Event.** Evidence turn must include `followUps` as a non-empty array (from `data-follow-ups` / `data.suggestions`).
- **Contrast (optional).** A coding decline query on a separate run must show `followUps: null` — chips are FAQ-path only.
- **Proof.** Save JSON with `followUps` listed; cite that field when claiming the feature verified.

## Gotchas

- Chips are generated after the main stream (`MODEL_SMALL`); a turn can have text + `done` slightly before chips arrive — the helper keeps reading until `parsed.done`, which should include follow-ups when present.
- Truncated or outdated `embed.js` may fail to render chips even when the WS event is correct; use `embed-widget` for the client bundle, this feature for the server event.
- Do not treat playground-only UI as proof if the WS payload is missing.
