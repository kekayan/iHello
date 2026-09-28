# iHello

Single-tenant site chat agent on Cloudflare Workers + Agents SDK (`agents@0.22.0`).

Product name: **iHello**. Worker/DB identifiers stay as specified (`site-chat-agent`, `chat_agent`, …).

## Stack

- Cloudflare Workers + Durable Objects via Agents SDK
- `AIChatAgent` harness (`@cloudflare/ai-chat`) on a Durable Object, driving `streamText` with refine / groundedness validation around the agentic loop
- Cloudflare AI Search instance `company-site`
- xAI / Anthropic / OpenAI / Workers AI via Cloudflare AI Gateway (default: `xai/grok-4.20-0309-non-reasoning` for low latency; Grok 4.6, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, and others in Settings), Unified Billing credits

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

Chat models use the **AI binding** (`env.AI.run` → AI Gateway Unified Billing). No provider API keys and no `CF_API_TOKEN` for chat.

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put SLACK_WEBHOOK_URL
# Optional — Knowledge admin REST only:
npx wrangler secret put CF_API_TOKEN
```

Locally, put the same keys in `.dev.vars`. Ensure gateway `AI_GATEWAY_ID` (`default`) exists and has Unified Billing / credits enabled.

## Wrangler vars to replace

In `wrangler.jsonc`: `database_id`, `CF_ACCOUNT_ID`, `TURNSTILE_SITE_KEY`, `NOTIFY_TO`, `NOTIFY_FROM`, `BOOKING_URL`.

## Admin auth (Cloudflare Access)

Protect only admin paths — leave the public widget open. **Do not** use “Protect this Worker” (locks chat + breaks WebSockets).

1. Zero Trust → **Access controls** → **Applications** → **Create new application**
2. Choose **Self-hosted and private** → **Add public hostname**
3. Paths on `hello.kekayan.com`: `admin`, `admin/*`, `api/*`
4. Policy: Allow your email (OTP and/or Google)
5. Copy **AUD** + team domain (`https://<team>.cloudflareaccess.com`):
   ```bash
   npx wrangler secret put CF_ACCESS_AUD
   ```
   In `wrangler.jsonc` vars: `"CF_ACCESS_TEAM_DOMAIN": "https://<team>.cloudflareaccess.com"`
6. `npx wrangler deploy`

The Worker verifies `Cf-Access-Jwt-Assertion` when those are set. Local `wrangler dev` skips Access until configured.

## Tests

With `wrangler dev` running, local D1 migrated, and AI Gateway credits configured
(Unified Billing on gateway `default`):

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
