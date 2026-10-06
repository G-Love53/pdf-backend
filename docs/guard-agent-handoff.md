# GUARD WC — agent handoff (read first)

> **Repo:** `pdf-backend` only (BAR segment). **Not** segment Netlify repos.  
> **Partner:** Jon Baker (GUARD Digital Distribution) — Gerry sends email; **do not draft duplicate Jon mails** unless Gerry asks.  
> **Posture:** CID is the **smallest** launch partner; move fast, **Policy # + RqUID** on every case, **no self-inflicted UAT mistakes**.

---

## Current status (2026-10-06)

Read [`decisions-log.md`](./decisions-log.md) before asking Gerry to re-explain WC.

| Area | State |
|------|--------|
| **Sandbox** | P-env signed off. `cid-pdf-api-sandbox` `offerWc: true` for beauty, cleaning, pet, fitness, plumber, electrical. Partner-test works. |
| **Prod** | Code is on `cid-pdf-api`. `GUARD_API_BASE` is `gigezrate`. Segment list, `CO`, SP name, and webhook auth are set. **Key, secret, and contract number are not generated.** Live config returns `offerWc: false`. |
| **Go-live** | Those three values come from GUARD. Do not copy sandbox or `PAFAKE10`. Leave `GUARD_CAPITA_PAY_URL` off. After the deploy is Live, smoke Electrical CO on the customer URL (unique name, ZIP, FEIN). |
| **Webhook** | `POST /webhooks/guard-docs` acks. Connect ingest waits until **16 October 2026**. |
| **COI** | GUARD cert adapter waits until Electrical WC is live on the customer URL. |
| **Off** | HVAC `5537`. Painter, bar, roofer not in the registry. Bar and roofer stay long-form. |

---

## Recent fixes (already on `main`)

1. **Multi-location** — `addresses[]` in parser; L1/L2 in `guardService.js` SOAP (`Non-Contractors-7`).
2. **Officer payroll** — `buildRatingPayloadFromForm` honors `extras.ownerPayroll`; UAT sends **$75k** for Non-Contractors-3 (`ownerPayroll: 75000` in JSON).
3. **CO UW question codes** — UAT matcher prefers GUARD CO list + index fallback `5183_` / `9014_` (not CA/MA). Verified: `classQuestionCds` in results JSON.
4. **CO officer min constant** — `GUARD_CO_OFFICER_PAYROLL = 79800` (GUARD dictionary update); pack overrides still win.
5. **Partner-test UI (Jon 2026-09-24)** — `bindable` only when QuotedNotBound **and** UW is not Refer/Reject (`isGuardInstantBindable`). SBR at `POST /api/guard/wc/refer` (same XML as BND). FEIN `xx-xxxxxxx`; mailing-same; optional L2; officer payroll; GUARD brand + policy code on quote/refer/decline. No class-code green boxes; no NBQ/NBS/BND in applicant copy. **Needs sandbox deploy** before Jon retests. RqUIDs he cited: `b325fb1d-…`, `5a372012-…`.

**Latest verified sandbox run:** `data/guard-uat-results-v1.json` (2026-09-23, three-case re-run).

**Defect log:** `data/guard-uat-defect-log-v1.md`

---

## Key code paths

| Path | Role |
|------|------|
| `src/services/guardService.js` | SOAP NBQ/NBS/BND, locations, officer XML, question answers |
| `src/services/guardUatService.js` | Automated UAT case runner + question matching |
| `src/services/guardIntakeService.js` | ConnectQuote WC intake (prod path) |
| `src/config/guardRegistry.js` | Segments, class codes, `GUARD_CO_OFFICER_PAYROLL` |
| `scripts/parse-guard-uat-pack.py` | Refresh cases from Jon’s xlsm in Downloads |
| `scripts/run-guard-uat.mjs` | POST to sandbox UAT API |
| `data/guard-question-index.json` | Question text → `questionCd` (fallback; **filter by CO**) |

---

## Commands

```bash
# Refresh cases from xlsm
python3 scripts/parse-guard-uat-pack.py

# Run all or subset on sandbox (needs deploy with latest main)
node scripts/run-guard-uat.mjs
node scripts/run-guard-uat.mjs --id Contractors-8
node scripts/run-guard-uat.mjs --id Non-Contractors-3 --id Contractors-1 --id Contractors-7

# Local UAT (only if .env has GUARD_* keys)
CID_UAT_API=http://localhost:3000 node scripts/run-guard-uat.mjs --id Contractors-1
```

**After code changes:** push `main` → wait for **cid-pdf-api-sandbox** deploy → re-run UAT. Remote runner does **not** use local files until deployed.

---

## Docs (canonical)

| Doc | Use |
|-----|-----|
| `docs/guard-integration.md` | API + architecture |
| `docs/guard-uat-runbook.md` | UAT workflow |
| `docs/guard-uat-jon-email-draft.md` | Sep 16 bulk results email (historical) |
| `docs/guard-uat-jon-reply-2026-09-23.md` | #3 / #1 / #7 fix summary (historical; Gerry sent) |
| `docs/guard-wc-rollout.md` | Segment rollout tiers |
| `docs/guard-sandbox-fixtures.md` | Redacted SOAP examples |

Local GUARD packet (not in repo): `~/Downloads/` or Documents — **GUARD WC API Documentation** xlsm/xlsx.

---

## When GUARD issues production credentials

1. Paste key, secret, and contract number on **cid-pdf-api** only. Confirm the deploy is Live.
2. `GET /api/guard/wc/config?segment=electrical&state=CO` → `offerWc: true`, `sandbox: false`.
3. Smoke Electrical CO on the live site (unique name, ZIP, FEIN), then the other five registry-on segments.
4. Doc ingest into Connect on **16 October 2026**. Cert adapter after that Electrical smoke, not before.

---

## Do not (avoid loops)

- Re-email Jon summarizing fixes already sent unless Gerry asks for a **new** topic.
- Re-explain Famous, Connect PWA, or Coterie unless the task crosses rails.
- Assume UAT local run works without `GUARD_*` in `.env` — use **sandbox API** after deploy.
- Edit Roofer/plumber segment repos for GUARD — **`pdf-backend` only**.

---

## Suggested first message in new agent chat

Copy/paste:

```
CID agent start — read pdf-backend/docs/agent-start.md and docs/decisions-log.md before asking Gerry anything.

Lane: GUARD go-live.
Working on: [prod credential smoke after GUARD sends the three values | 16 Oct doc ingest | COI adapter after Electrical is live].
```
