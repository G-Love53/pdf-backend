#!/usr/bin/env bash
# Smoke test CID-PDF-API + /api/connect (after deploy).
#
# Usage:
#   export CID_API_URL=https://cid-pdf-api.onrender.com
#   export TEST_EMAIL=you@example.com          # must exist as clients.primary_email in cid-postgres
#   export TEST_USER_ID=                       # optional Supabase auth UUID (X-User-Id)
#   bash scripts/smoke-connect-api.sh
#
# Expect:
#   - /healthz → 200 body "ok"
#   - /api/connect/profile → 200 JSON with ok:true, or 404 if no client row for email
#   - /api/connect/chat → 200 JSON with ok:true and data.message (needs ANTHROPIC_API_KEY on Render)

set -euo pipefail

BASE="${CID_API_URL:-https://cid-pdf-api.onrender.com}"
BASE="${BASE%/}"

if [[ -z "${TEST_EMAIL:-}" ]]; then
  echo "Set TEST_EMAIL to an email that exists in cid-postgres clients.primary_email" >&2
  exit 1
fi

echo "=== 1) GET ${BASE}/healthz ==="
code=$(curl -sS -o /tmp/smoke-healthz.txt -w "%{http_code}" "${BASE}/healthz")
cat /tmp/smoke-healthz.txt
echo ""
echo "HTTP ${code}"
[[ "${code}" == "200" ]] || { echo "FAIL: expected 200" >&2; exit 1; }

# One array avoids "${empty[@]}" under `set -u` (macOS / older bash quirk).
CURL_HDRS=( -H "X-User-Email: ${TEST_EMAIL}" )
if [[ -n "${TEST_USER_ID:-}" ]]; then
  CURL_HDRS+=( -H "X-User-Id: ${TEST_USER_ID}" )
fi

echo ""
echo "=== 2) GET ${BASE}/api/connect/profile ==="
code=$(curl -sS -o /tmp/smoke-profile.json -w "%{http_code}" "${CURL_HDRS[@]}" "${BASE}/api/connect/profile")
cat /tmp/smoke-profile.json | head -c 800
echo ""
echo "HTTP ${code}"
# 200 = client found, 404 = no client for this email (still proves route + auth work)
[[ "${code}" == "200" || "${code}" == "404" ]] || { echo "FAIL: expected 200 or 404" >&2; exit 1; }

echo ""
echo "=== 3) POST ${BASE}/api/connect/chat ==="
code=$(curl -sS -o /tmp/smoke-chat.json -w "%{http_code}" \
  -H "Content-Type: application/json" \
  "${CURL_HDRS[@]}" \
  -d '{"message":"Reply with exactly: smoke-ok","policyContext":null,"chatHistory":[],"aiSummary":null}' \
  "${BASE}/api/connect/chat")
cat /tmp/smoke-chat.json | head -c 1200
echo ""
echo "HTTP ${code}"
[[ "${code}" == "200" ]] || { echo "FAIL: chat expected 200 (check ANTHROPIC_API_KEY / deploy)" >&2; exit 1; }
grep -q '"ok":true' /tmp/smoke-chat.json || { echo "FAIL: expected ok:true in body" >&2; exit 1; }

echo ""
echo "=== smoke-connect-api: PASS ==="
