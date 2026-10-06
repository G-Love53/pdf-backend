# Decisions log

New agents read [`agent-start.md`](./agent-start.md) first. This file is the dated calls behind it. Git history holds the rest. No secrets in this file.

Edit this file when a decision would change the next session. Specs stay in their own docs.

---

## 2026-10-06 — Where documents live

- **Edit** pipeline, carrier, deploy, and partnership specs in `pdf-backend/docs/`.
- **Edit** the Connect app in `cid-connect/docs/`.
- `~/GitHub/CID-docs/` is an index. Those filenames stay so old links open. They point here. They are not a second copy.
- Home-folder `*.md` files are pointers. Do not edit them as specs.
- `/Volumes/CID_Master/docs-snapshots/YYYY-MM-DD/` is a read-only archive taken after a doc pass. Do not edit it. Do not use `CID_MASTER_OLD_DO_NOT_USE`. The January 2026 tree is not the working repo.

## 2026-10-06 — GUARD production

- Code is done. Customer sites call prod `cid-pdf-api`. Prod `offerWc` is false until GUARD generates `GUARD_API_KEY`, `GUARD_API_SECRET`, and `GUARD_CONTRACT_NUMBER`.
- Those three come from GUARD at go-live. The sandbox key, secret, and `PAFAKE10` stay on `cid-pdf-api-sandbox`.
- Prod `GUARD_API_BASE` is `gigezrate`, not `pgigezrate`.
- `GUARD_ENABLED_SEGMENTS` on prod: `beauty,cleaning,pet,fitness,plumber,electrical`. `GUARD_PILOT_STATES=CO`. `GUARD_SP_NAME` and `GUARD_WEBHOOK_AUTH` are set.
- Do not add `GUARD_CAPITA_PAY_URL` until GUARD sends the real template. A blank or placeholder row can turn the pay button on.
- After the three values are Live: smoke Electrical CO on the customer URL with a unique name, ZIP, and FEIN. Then the other five. Connect shows the second policy card after that bind.
- Doc webhook acks today. Connect ingest is 16 October 2026.
- GUARD certificate adapter waits until Electrical WC is live. Do not draft a CID ACORD 25 for a GUARD policy.
- HVAC class `5537` stays `wcEnabled: false`. Painter, bar, and roofer are not in the GUARD registry. Bar and roofer stay long-form.
- Do not edit plumber or roofer repos for GUARD. Do not rebuild Electrical WC.

## 2026-10-06 — Connect COI

- Instant COI in Connect today is CID ACORD 25. That is correct for long-form (`bind_source: boldsign`).
- Coterie and GUARD policies need carrier paper. Spec: `connect-coi-carrier.md`.
- David has been asked for Generate COI and Add Additional Insureds. Do not scrape `dashboard-v2`. Do not fall back to CID ACORD on `coterie` or `guard`.
- Connect pet canonical domain is `petserviceinsurancedirect.com`.

## 2026-10-06 — Geography

- Places autocomplete: CO plus AZ, UT, NM, WY, NV, ID, KS, NE, OK, TX.
- `COTERIE_PILOT_STATES` and `GUARD_PILOT_STATES` are CO. Autocomplete is not a bind state.

## 2026-09 — NEXT and other rails

- NEXT is optional. Go only if quote and bind are headless in our UI, and Connect receives policy number plus documents. An embed or a required NEXT portal is a no-go.
- Sequence: WC live in CO, deepen Coterie, then other direct carriers on the same pattern. Revisit NEXT only for a hard gap.
- CoverForce was approached as infrastructure, not as a competing agency.
- Simply Business is a market analog. It is not the CID front door.
- Three rails: long-form, Coterie BOP/GL, GUARD WC. Same intake, same Connect. Cards are complementary coverages.

## 2026-08-20 — GUARD product shape

- NBQ indication is about 2–4 extra fields. FEIN is not required for the indication.
- NBS is the longer question set plus FEIN, then BND.
- GUARD direct-bills. CID is not merchant of record.
- Clickwrap unless GUARD requires a signed PDF.
- Customers never see the name “Digital Decision.”
- WC on/off is per segment. A new ConnectQuote trade does not turn WC on.
- Later, WC may be sold first. The adapter must not require a Coterie policy.

## Standing

- Connect is not on Render.
- Browser uses the Famous anon key only. `SUPABASE_SERVICE_ROLE_KEY` stays on servers.
- Gerry sends partner email (Jon, David). The agent does not email Jon unless Gerry asks.
- Claude is primary for coverage chat. Gemini is the fallback.
