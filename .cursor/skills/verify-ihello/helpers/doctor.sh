#!/usr/bin/env bash
# Read-only: is the verification target reachable?
set -euo pipefail
BASE="${IHELLO_HTTP_BASE:-https://site-chat-agent.kekayanlabs.workers.dev}"
ACCESS="${IHELLO_ACCESS:-bench-bypass}"
echo "doctor: GET $BASE/config"
code=$(curl -sS -o /tmp/ihello-doctor-config.json -w "%{http_code}" \
  -H "Cf-Access-Jwt-Assertion: $ACCESS" \
  "$BASE/config" || true)
echo "http_status=$code"
head -c 400 /tmp/ihello-doctor-config.json; echo
test "$code" = "200"
