# iHello

Single-tenant site chat agent on Cloudflare Workers + Agents SDK (`agents@0.22.0`).

Product name: **iHello**. Worker/DB identifiers stay as specified (`site-chat-agent`, `chat_agent`, …).

## Stack

- Cloudflare Workers + Durable Objects via Agents SDK
- Custom refine → retrieve → generate → validate harness (not Project Think)
- Cloudflare AI Search instance `company-site`
- Anthropic via AI Gateway (`claude-sonnet-5` / `claude-haiku-4-5-20251001`)
- D1 `chat_agent`, Analytics Engine `chat_agent_events`
- Turnstile (free tier) + Workers rate limiting
- Slack incoming webhook notifications (extendable channel interface for email/WhatsApp later)
- Cloudflare Access in front of `/admin*` and `/api/*`

## Local development

```bash
npm install
# create local D1 (first time)
npx wrangler d1 create chat_agent   # then paste database_id into wrangler.jsonc
npm run db:migrate:local
cp .dev.vars.example .dev.vars      # fill secrets
npx wrangler dev
```

Open `http://127.0.0.1:8787/` for the widget demo.

Admin is a TanStack Start app under `admin/` (SPA, base `/admin`) with **shadcn/ui** + Tailwind:

```bash
# terminal A — agent worker + APIs
npm run dev
# terminal B — admin UI (proxies /api to :8787)
npm run dev:admin
```

Open `http://127.0.0.1:3000/admin/`. For production, `npm run build:admin` copies the SPA into `public/admin` and the Worker serves it at `/admin`.

```bash
cd admin && npx shadcn@latest add <component>
```


## Secrets

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put SLACK_WEBHOOK_URL
npx wrangler secret put CF_API_TOKEN
```

Locally, put the same keys in `.dev.vars`.

If your AI Gateway requires Cloudflare authentication, also send `cf-aig-authorization: Bearer <token>` (document the token source in your ops runbook). The code uses `x-api-key` for Anthropic as specified.

## Wrangler vars to replace

In `wrangler.jsonc`: `database_id`, `CF_ACCOUNT_ID`, `TURNSTILE_SITE_KEY`, `NOTIFY_TO`, `NOTIFY_FROM`, `BOOKING_URL`.

## Cloudflare setup checklist

1. Create D1 database `chat_agent` and apply migrations.
2. Create AI Search instance `company-site` and index site content / upload docs via admin Knowledge.
3. Create AI Gateway `site-chat` with Anthropic provider.
4. **Manual:** configure an AI Gateway budget alert for spend control (required by guardrail checklist L5).
5. Optional: enable AI Gateway Guardrails on the refine (non-streamed) path only — never on streamed generate.
6. Create Turnstile invisible widget (free tier) and set site key + secret.
7. Create Slack incoming webhook; set `SLACK_WEBHOOK_URL`.
8. Put Cloudflare Access in front of `/admin*` and `/api/*`. The Worker only checks for `Cf-Access-Jwt-Assertion`.
9. Deploy: `npm run deploy`.

## Tests

With `wrangler dev` running, local D1 migrated, and live credentials configured
(`ANTHROPIC_API_KEY`, AI Search instance, AI Gateway):

```bash
npm run test:personas
```

The suite exits non-zero on any failure. Without live model/search credentials the
runner still executes but scenarios that depend on refine/generate/handoffs will
fail (expected); use `tsc --noEmit` and `wrangler deploy --dry-run` for the offline gate.

Preview mode (`?preview=1`) skips Turnstile, rate limits, D1 flush, notify, and AE, but still inserts handoffs under `preview_` conversation ids.

## Embed

```html
<script src="https://YOUR_WORKER/embed.js" async></script>
```
