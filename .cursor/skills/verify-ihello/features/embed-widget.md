# Embed widget bundle

The public `embed.js` served by the Worker must be present, non-truncated, and contain the chat send path symbols the widget needs (`sendMessage`, `cf_agent_use_chat_request`).

## Sub-features

- `embed-reachable` GET `/embed.js` (or site-relative embed URL) returns 200 with a substantial body.
- `embed-send-path` body includes `sendMessage` and `cf_agent_use_chat_request`.
- `embed-size-floor` size is large enough to rule out known truncation failures.

## How to get to it (user POV)

- Load `https://site-chat-agent.kekayanlabs.workers.dev/embed.js` (or the hello.kekayan.com script tag pointing at the Worker).
- Site pages that include the async embed script.

## Driving it with ws-turn

Preconditions:

- Doctor is green (same Access header for consistency on workers.dev).
- This feature is proven with `curl`, not `ws-turn` (WS helper is for chat turns; still part of the verify-ihello harness).

- **Fetch bundle.** Run:

```bash
curl -sS -D /tmp/ihello-embed.hdr -o /tmp/ihello-embed.js \
  -H "Cf-Access-Jwt-Assertion: ${IHELLO_ACCESS:-bench-bypass}" \
  "${IHELLO_HTTP_BASE:-https://site-chat-agent.kekayanlabs.workers.dev}/embed.js"
```

- **Status + size.** HTTP 200; `wc -c /tmp/ihello-embed.js` should be a healthy full bundle (tens of KB+, not a tiny truncated stub). Record byte size in the proof notes or a small `evidence/embed-widget.json` you write by hand.
- **Required symbols.** `rg -n "sendMessage|cf_agent_use_chat_request" /tmp/ihello-embed.js` must hit both. Absence of either is a failed embed recovery / bad deploy.
- **Proof.** Keep headers, byte size, and the two match lines with the verification claim.

## Gotchas

- A prior truncated `embed.js` shipped without `sendMessage` / protocol strings — always check size **and** symbols, not size alone.
- CDN/browser cache can serve a stale truncated file after a fix; cache-bust or check workers.dev origin directly.
- Passing `ws-turn` does not prove the embed bundle; do not skip this feature when the claim is about the widget.
