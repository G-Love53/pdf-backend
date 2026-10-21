# Agent start

Read this once at the start of a session, then [`decisions-log.md`](./decisions-log.md). Do not ask Gerry to re-explain what is already here.

One operating picture. Specialist agents use a **lane** below. They still use this backend. They do not start a second stack.

---

## Who

- Gerry sends all partner email (Jon at GUARD, David at Coterie). Do not email them unless Gerry asks for a draft and then sends it himself.
- Connect is not on Render. Operator, S4–S6, Coterie, and GUARD run in **pdf-backend** (CID-PDF-API on Render).
- Connect auth is Famous. Browser gets the anon key only. Never put `SUPABASE_SERVICE_ROLE_KEY` in Connect.
- RSS: Reliable, Scalable, Sellable. No secrets in chat or in git.
- Colorado trade name **CID Insurance Services** is effective. Secretary of State ID **20268251529**, filed **8 October 2026**, registrant **Rick P Cline Agency dba All Access Insurance LLC**. The ready-to-bind note says **Insurance offered through All Access Insurance LLC dba CID Insurance Services · CO License #6784587.** Do not put **Commercial Insurance Direct** on that license line. **Commercial Insurance Direct, Inc.** stays in the next sentence as the technology platform, and it is not an insurer. The public website and the Instantly footer still use the older line. Do not rewrite them until Gerry asks. Site phone: **(720) 677-6227**.
- **6784587** is the All Access agency NPN. Richard P. Cline’s producer NPN is **6762689**. Use the producer number when a carrier needs a person. Gerry sent it to Jon on 14 October 2026.
- All Access has a Hartford appointment and IVANS. Connect does not read that feed yet. Small-commercial Spectrum quoting is the EBC portal unless the Hartford rep confirms an API. An embed or a required carrier portal is a no-go. Do not build a Hartford adapter on a guess.

## What is live

- Coterie BOP/GL on **CO** for electrical, plumber, HVAC, fitness, beauty, cleaning, pet, painter.
- GUARD workers’ comp on production `cid-pdf-api`, **CO only**, for beauty, cleaning, pet, fitness, plumber, electrical. Prod `GUARD_ENABLED_SEGMENTS` is exactly `beauty,cleaning,pet,fitness,plumber,electrical`. Do not clear it. HVAC `wcEnabled` is false (class `5537`). Painter, bar, and roofer are not in the GUARD registry.
- Jon gave the official green light on 16 October 2026 to submit business on the live API. Prod base is `gigezrate` (no P). SP name is `com.commercialinsurance-direct`. Sandbox stays `pgigezrate` and `PAFAKE10`. Do not copy the sandbox key, secret, or `PAFAKE10` onto prod. Username and password are the Agency Service Center portal only, not env vars.
- A bound WC policy gets its own `policies` row. `finalizeGuardBind` locks only the submission (`FOR UPDATE OF s`), commit `5d88d50`. It does not wait for a Coterie BOP.
- Webhook PDF ingest is built and pushed, commit `25b97d0`, on prod and sandbox. `POST /webhooks/guard-docs` checks auth (401 if bad), then saves the carrier PDF to R2 and a documents row on the policy, matched by policy number, any state. The same file twice is one document. A different file is a second document. If the policy row does not exist yet, the PDF is stored pending and attached when bind finishes. Every case except bad auth returns 200. Live: `https://cid-pdf-api.onrender.com/webhooks/guard-docs`. Sandbox: `https://cid-pdf-api-sandbox.onrender.com/webhooks/guard-docs`. The earlier sandbox file `SUWC781711` was discarded before this code and will not appear unless GUARD posts it again.
- `GUARD_CAPITA_PAY_URL` stays unset. GUARD emails pay info. CID does not collect the card. Do not put the bare `https://policyholder.guard.com/payment` link on the customer confirmation.
- A ConnectQuote price that is ready to bind and still open gets one email about an hour later, then a note the next day and on day three. A last note goes out only when the carrier sent a real valid-through date. No PDF. Bar and roofer are skipped. An indication is not a trigger. From `support@commercialinsurance-direct.com`. Not Instantly. Flow: [`CID_ARCHITECTURE.md`](./CID_ARCHITECTURE.md). Runtime: [`Deploy_Guide.md`](./Deploy_Guide.md).
- Bar and roofer are long-form only.
- Instant COI for long-form (`boldsign`) is CID ACORD 25. Coterie and GUARD use carrier paper. Do not fall back to CID ACORD on those policies. David (14 October 2026) pointed at the policy-docs retrieve we already call. The create-certificate call, unlimited holder certs, and Designated Additional Insured vs Add Additional Insureds are still open. Do not build that adapter. Do not scrape the Coterie dashboard. Spec: [`connect-coi-carrier.md`](./connect-coi-carrier.md).
- Am I Covered stays Claude, then Gemini if Claude fails. GUARD chat uses the coverage summary saved at bind. The existing document indexer picks up declarations and policy PDFs. No Perplexity.
- Connect: `https://connect.commercialinsurance-direct.com`. Demo login `g@commercialinsurance-direct.com` (Gerry forwards the OTP).
- Two-step demo: (1) fitness-demo sandbox quote, throw that policy away. (2) Connect golden Fitness policy `CSG-00507726-00`.
- Pet canonical domain is `petserviceinsurancedirect.com`.

## What is not live

- The next 10 states were approved by both GUARD and Coterie on 19 October 2026: AZ, UT, NM, WY, NV, ID, KS, NE, OK, TX. Places autocomplete already allows them. They are not bind states. `GUARD_PILOT_STATES` and `COTERIE_PILOT_STATES` stay `CO` until a state is added one at a time: Jon’s class suffix for workers’ comp, one smoke, then add the state to the pilot list. New Hampshire and Maine need an officer date of birth or SSN before any test. They are not in this ten.
- Coterie Generate COI adapter (create-certificate). Do not build it on the 14 October reply.
- GUARD certificate adapter. WC bind and PDF ingest are live. The cert path is still an open ask. Do not draft a CID ACORD 25 for a GUARD policy.

## Docs

| Need | File |
|------|------|
| Dated calls | [`decisions-log.md`](./decisions-log.md) |
| Next carrier | This file, **New carrier** lane |
| Index | [`../DOCUMENTATION.md`](../DOCUMENTATION.md) |
| GUARD detail | [`Workers_Comp.md`](./Workers_Comp.md), [`guard-integration.md`](./guard-integration.md), [`guard-wc-rollout.md`](./guard-wc-rollout.md) |
| Coterie | [`coterie-integration.md`](./coterie-integration.md) |
| Connect app | `cid-connect/docs/ARCHITECTURE.md`, `WORKFLOW_HANDOFF.md` |
| Outreach | [`outreach-claude-playbook.md`](./outreach-claude-playbook.md) |
| Unbound quote note | [`CID_ARCHITECTURE.md`](./CID_ARCHITECTURE.md), [`Deploy_Guide.md`](./Deploy_Guide.md), [`AUDIT_READINESS.md`](./AUDIT_READINESS.md) |

`~/GitHub/CID-docs/` and home-folder `*.md` files are pointers. `/Volumes/CID_Master/docs-snapshots/` is a read-only archive. Do not edit `CID_MASTER_OLD_DO_NOT_USE`.

---

## Lanes

Pick one. Stay in pdf-backend for anything that quotes, binds, or writes a policy.

### General

Read this file and the decisions log. Colorado WC for the six trades is live. A new carrier follows the **New carrier** lane.

### New carrier

A new carrier is a **new adapter on the existing spine**, not a new app. Follow this list. GUARD workers’ comp is the short worked example under each step. Specialist docs point here. They do not keep a second status.

1. **Six gates before any build.** Headless quote and bind in CID’s UI (no carrier portal, no iframe). Webhooks or a real document pull so the policy number and the PDFs land in Connect. The carrier is merchant of record (CID never collects the card). One intake. Connect is the servicing app. An embed or a required carrier portal is a no-go.
   GUARD: SOAP quote and bind on ConnectQuote, PDF on `POST /webhooks/guard-docs`, GUARD direct-bills, same intake, Connect shows the policy.

2. **Code lives only in pdf-backend** as a new adapter on the same intake and Connect spine. Segment repos stay Netlify intake. No second operator stack. No carrier secrets in the browser or in git.
   GUARD is the SOAP adapter and `/api/guard/wc/*` on CID-PDF-API.

3. **Bind writes a `policies` row** of its own, even when another coverage already exists on the submission. Documents ingest like Coterie and GUARD: store the carrier PDF, attach by policy number, pending if the webhook beats the policy row, idempotent on content hash, ack 200 after the save attempt so the carrier does not retry forever, 401 only for bad auth.
   GUARD: `finalizeGuardBind` locks only the submission (`FOR UPDATE OF s`), commit `5d88d50`. The WC row does not wait for a Coterie BOP. PDF ingest is commit `25b97d0` on prod and sandbox.

4. **Carrier paper for that carrier’s COI.** Long-form (`boldsign`) keeps CID ACORD 25. Do not fall back to CID ACORD on an API carrier.
   Coterie and GUARD follow this. The Coterie create-certificate call is still open. Do not build that adapter. Do not scrape the Coterie dashboard.

5. **State expansion is config.** Pilot state list, plus class or appetite confirmation, plus one smoke. Not a new integration. Do not turn on a state because autocomplete allows it.
   The next 10 states are approved and still off both pilot lists. Add one state only after the class check and one smoke.

6. **Gerry sends the partner email.** Add a dated line to [`decisions-log.md`](./decisions-log.md) when the go/no-go is made. Do not email Jon or David.

7. **Smoke the customer URL**, not the partner-test page, before marketing copy for that carrier.
   GUARD partner-test (`/partner-test/guard-wc.html` on sandbox) is not the launch smoke.

NEXT is not on this path. Revisit only for a hard gap, and only inside our UX. See the 2026-09 entry in the decisions log.

### GUARD go-live

Colorado workers’ comp is live for `beauty,cleaning,pet,fitness,plumber,electrical`. Do not clear that list. Prod base is `gigezrate`. SP name is `com.commercialinsurance-direct`. Sandbox stays `pgigezrate` and `PAFAKE10`. `GUARD_CAPITA_PAY_URL` stays unset. Adding a state or a trade is step 5 of the **New carrier** lane, plus the registry notes in [`guard-wc-rollout.md`](./guard-wc-rollout.md). Do not rebuild Electrical WC.

### Connect

Famous auth, insurance data through CID-PDF-API `/api/connect/*`. Do not deploy Connect to Render. Do not put service role in the bundle. Pet links use `petserviceinsurancedirect.com`.

### Outreach

Lists and Instantly CSV vars are `pdf-backend/scripts/` and [`outreach-claude-playbook.md`](./outreach-claude-playbook.md) §D for HTML (21 October 2026). `ch=` and `src=` are the same value. `cid` is the step and lives in `raw_submission_json`. Do not use Zywave. Do not host campaign images on Render or in Instantly. Link tracking stays off.

---

## First message for a new chat

```
CID agent start — read pdf-backend/docs/agent-start.md and docs/decisions-log.md before asking Gerry anything.

Lane: [general | new carrier | GUARD go-live | Connect | outreach].
Working on: [one sentence].
```
