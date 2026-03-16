#!/usr/bin/env bash
# After deploy is green: hit Render (or local) and save + open the BAR packet PDF.
# Usage: ./scripts/test-bar-packet.sh [BASE_URL]
#   BASE_URL default: $PDF_BACKEND_URL or https://pdf-backend-XXXX.onrender.com (set yours)
set -e
BASE_URL="${1:-${PDF_BACKEND_URL}}"
if [[ -z "$BASE_URL" ]]; then
  echo "Set PDF_BACKEND_URL or pass base URL: ./scripts/test-bar-packet.sh https://your-app.onrender.com"
  exit 1
fi
BASE_URL="${BASE_URL%/}"
OUT="${2:-./test-bar-packet-$(date +%Y%m%d-%H%M%S).pdf}"

echo "POST $BASE_URL/render-bundle (BAR_INTAKE)..."
resp=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/render-bundle" \
  -H "Content-Type: application/json" \
  -d '{"bundle_id":"BAR_INTAKE","data":{"insured_name":"Test"}}')

code=$(echo "$resp" | tail -n1)
body=$(echo "$resp" | sed '$d')

if [[ "$code" != "200" ]]; then
  echo "HTTP $code"
  echo "$body" | head -c 500
  exit 1
fi

echo "$body" > "$OUT"
echo "Saved: $OUT"
open "$OUT"
