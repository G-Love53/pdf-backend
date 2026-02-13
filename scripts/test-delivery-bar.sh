#!/usr/bin/env bash
# Bar segment — test delivery and printing
# Sends BAR_INTAKE bundle (SUPP_BAR + ACORD125/126/130/140) to quote@barinsurancedirect.com
# Usage: ./scripts/test-delivery-bar.sh   (or: bash scripts/test-delivery-bar.sh)

set -e
BASE_URL="${BASE_URL:-https://cid-pdf-api.onrender.com}"
TO="${TO:-quote@barinsurancedirect.com}"

echo "Bar test delivery: POST $BASE_URL/submit-quote → $TO"
echo ""

RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/submit-quote" \
  -H "Content-Type: application/json" \
  -d '{
  "bundle_id": "BAR_INTAKE",
  "formData": {
    "applicant_name": "Test Bar Ops",
    "insured_name": "Test Bar Ops",
    "premises_name": "Test Bar LLC",
    "premise_address": "123 Main St",
    "organization_type": "LLC",
    "business_phone": "555-000-0000",
    "contact_email": "test@example.com",
    "effective_date": "2025-02-13",
    "square_footage": "2500",
    "total_sales": "500000",
    "num_employees": "5"
  },
  "email": {
    "to": ["'"$TO"'"],
    "subject": "CID Bar — Ops test delivery"
  }
}')

HTTP_BODY=$(echo "$RESP" | head -n -1)
HTTP_CODE=$(echo "$RESP" | tail -n 1)

echo "HTTP $HTTP_CODE"
echo "$HTTP_BODY" | jq -r '.' 2>/dev/null || echo "$HTTP_BODY"

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
  echo ""
  echo "OK — Check inbox: $TO (subject: CID Bar — Ops test delivery)"
else
  echo ""
  echo "Request failed (HTTP $HTTP_CODE). Check body above."
  exit 1
fi
