# SPEC — Site Chat Agent on Cloudflare (single-tenant) · iHello

Version 1.0 · Aug 2026.

This repository implements the Site Chat Agent specification under the product name **iHello**.

## Approved amendments (v1 implementation)

1. **README.md** added for deployment and Gateway budget-alert documentation (section 15).
2. **Notifications:** Resend email replaced by an extendable `NotifyChannel` interface. Active channel is Slack incoming webhook (`SLACK_WEBHOOK_URL`). Email and WhatsApp channel stubs exist for later.
3. **Groundedness:** `messages.grounded_commit INTEGER` added; Analytics Engine doubles include a fifth `grounded_commit` value.
4. **Behaviour presets:** Lead-gen and Sales load section 6 defaults; Support swaps lead/escalation procedure strings.
5. **AI Search:** Uses current `ai_search` Workers binding and `/ai-search/instances/{id}` REST Items/Jobs/Stats APIs (legacy AutoRAG paths deprecated).
6. **Rate limiting:** Uses `ratelimits` wrangler key (not obsolete `unsafe` binding).
7. **Dependencies:** Only `agents`, `wrangler`, `typescript`, `@cloudflare/workers-types` as direct deps, versions pinned in package.json.

Fixed infrastructure identifiers (`site-chat-agent`, `chat_agent`, `ChatAgent`, protocol field names, procedure strings, tool schemas) are unchanged.

The full normative behaviour is implemented across:

- `src/server.ts`, `src/chat-agent.ts`, `src/pipeline.ts`, `src/tools.ts`
- `src/settings.ts`, `src/admin-api.ts`, `src/knowledge-api.ts`
- `src/notify.ts`, `src/analytics.ts`
- `public/embed.js`, TanStack Start admin in `admin/` (built to `public/admin`)
- `migrations/0001_init.sql`, `test/personas.ts`, `test/run-personas.ts`

Refer to the original SPEC sections 1–18 in the project brief for verbatim strings, protocol frames, and guardrail checklist. Where this file and the brief conflict on the amendments above, this file wins.
