# GUARD WC UAT — Jon test pack v1 (Sep 2026)

> **Source:** `CID GUARD WC Q Changes - UAT Test Pack v1.xlsm` (Jon, Sep 2026)  
> **Env:** GUARD **P/sandbox** on `cid-pdf-api-sandbox`  
> **Related:** [`guard-integration.md`](./guard-integration.md) · [`guard-sandbox-fixtures.md`](./guard-sandbox-fixtures.md)

---

## What Jon is testing

- **ACORD** policy-level UW questions map correctly (favorable vs referral/decline triggers).
- **Class-specific** UW questions map to GUARD + partner portal.
- **Experience mod** sends on NBS and displays on quote.
- **Quote / Refer / Decline** outcomes match expected rows.

**Required on every case:** GUARD **Policy Number** + **RqUID** (Defect Log tab).

**Webhook:** Jon noted doc webhook ticket still in progress — UAT does not block on doc ingest.

---

## CID automation

| Asset | Role |
|-------|------|
| `scripts/parse-guard-uat-pack.py` | xlsm → `data/guard-uat-cases-v1.json` |
| `scripts/run-guard-uat.mjs` | POST all cases to sandbox UAT API |
| `POST /api/guard/wc/uat/run` | Runs pack (partner-test gate; sandbox only) |
| `data/guard-uat-results-v1.json` | Last run output (Policy #, RqUID, pass/fail) |

```bash
# Refresh cases from Jon's xlsm (Downloads)
python3 scripts/parse-guard-uat-pack.py

# Run on sandbox (after deploy)
node scripts/run-guard-uat.mjs

# Smoke one case
node scripts/run-guard-uat.mjs --id Contractors-1
```

---

## Class code note

Jon’s sheet uses `5183CO` format. CID sends **RatingClassificationCd** per registry (e.g. plumber **`518322`**). Confirm with Jon if his ASC expects suffix `22` vs `00`.

---

## Manual fallback

Partner test UI: `/partner-test/guard-wc.html` — one case at a time with ex mod + UW answers.
