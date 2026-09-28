# Lead handoff

A buying visitor who describes a consulting need and leaves an email should get a lead handoff (tool `handoff`) confirming a human will follow up — not a silent FAQ-only loop.

## Sub-features

- `handoff-intent` recognises multi-turn buying / consultant intent.
- `handoff-email-required` records a lead only after a valid email is present.
- `handoff-confirm` assistant confirms the handoff / follow-up by email in the reply text.

## How to get to it (user POV)

- In the widget, describe needing help (e.g. cloud migration consultant / delivery pod), continue when asked, then provide an email to be connected.
- Same multi-turn path over one WebSocket conversation via `--turns`.

## Driving it with ws-turn

Preconditions:

- Doctor is green.
- Use one helper process for the whole multi-turn (single `convId`).

- **Multi-turn lead.** Run:

```bash
node helpers/ws-turn.mjs --turns '[
  "We need a consultant for cloud migration and modernisation across our platforms. Can you help?",
  "Please connect us with someone — my email is verify-lead@example.com"
]' --out evidence/handoff-lead.json
```

- **Observable result.** Final turn `text` should acknowledge connecting / handoff / follow-up by email. Evidence `tools` / events may show `handoff`. Exit code `0` with non-empty text on every turn.
- **Email.** The provided address must appear in the flow (assistant confirmation or tool path); do not claim handoff success if the model only restates services with no connect/lead language.
- **Proof.** Keep `evidence/handoff-lead.json` with both turns' texts and tool events.

## Gotchas

- FAQ-only migration questions should **not** hand off — that belongs to `faq-services`. This feature needs clear buying + email.
- Invalid or missing email should cause the tool to ask for email rather than invent a recorded lead.
- Never wipe the `handoffs` D1 table to "clean up"; verification leaves the `verify_*` row alone.
- Sticky browser chats can already be mid-handoff; always use the helper's fresh `verify_*` id.
