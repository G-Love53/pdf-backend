# GUARD WC — agent handoff (read first)

> **Repo:** `pdf-backend` only (BAR segment). **Not** segment Netlify repos.  
> **Partner:** Jon Baker (GUARD Digital Distribution) — Gerry sends email; **do not draft duplicate Jon mails** unless Gerry asks.  
> **Posture:** CID is the **smallest** launch partner; move fast, **Policy # + RqUID** on every case, **no self-inflicted UAT mistakes**.

---

## Current status (2026-09-23)

| Area | State |
|------|--------|
| **Env** | **P/sandbox** API on `cid-pdf-api-sandbox.onrender.com`; prod keys **not** live yet |
| **UAT pack** | Jon’s xlsm → `data/guard-uat-cases-v1.json` (16 cases) |
| **Automation** | `POST /api/guard/wc/uat/run` + `node scripts/run-guard-uat.mjs` |
| **Email to Jon** | Fixes for #3, #1, #7 and #7 multi-location **communicated**; **waiting on Jon** for **Contractors-8** CO question ID + **live/prod credentials** |
| **Open UAT** | **Contractors-8** — expected Refer (above 15 ft); need GUARD’s CO `QuestionCd` (`56-9014_04`?) |
| **Open product** | ConnectQuote WC on intake (`guardIntakeService`); multi-location WC in **UAT/SOAP** only — ConnectQuote intake still **single location** |

---

## Recent fixes (already on `main`)

1. **Multi-location** — `addresses[]` in parser; L1/L2 in `guardService.js` SOAP (`Non-Contractors-7`).
2. **Officer payroll** — `buildRatingPayloadFromForm` honors `extras.ownerPayroll`; UAT sends **$75k** for Non-Contractors-3 (`ownerPayroll: 75000` in JSON).
3. **CO UW question codes** — UAT matcher prefers GUARD CO list + index fallback `5183_` / `9014_` (not CA/MA). Verified: `classQuestionCds` in results JSON.
4. **CO officer min constant** — `GUARD_CO_OFFICER_PAYROLL = 79800` (GUARD dictionary update); pack overrides still win.

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

## When Jon / prod unblocks

1. **Contractors-8** — Apply Jon’s CO question ID; re-run case; update defect log.
2. **Prod credentials** on **cid-pdf-api** (Render), not sandbox; smoke one CO case (partner test UI or intake).
3. **Webhook** — doc delivery ingest (separate ticket); see `Document Delivery Guide` in packet.
4. **Experience mod** — still ask GUARD which response field echoes `FormatModFactor`.

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
GUARD WC handoff — read pdf-backend/docs/guard-agent-handoff.md first.

Working on: [Contractors-8 after Jon replies | prod key smoke | webhook | other].

Constraints: pdf-backend only; Gerry already emailed Jon on UAT fixes — waiting on #8 question ID + live keys. No duplicate partner emails unless I ask.
```
