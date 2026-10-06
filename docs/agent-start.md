# Agent start

Read this once at the start of a session, then [`decisions-log.md`](./decisions-log.md). Do not ask Gerry to re-explain what is already here.

One operating picture. Specialist agents use a **lane** below. They still use this backend. They do not start a second stack.

---

## Who

- Gerry sends all partner email (Jon at GUARD, David at Coterie). Do not email them unless Gerry asks for a draft and then sends it himself.
- Connect is not on Render. Operator, S4–S6, Coterie, and GUARD run in **pdf-backend** (CID-PDF-API on Render).
- Connect auth is Famous. Browser gets the anon key only. Never put `SUPABASE_SERVICE_ROLE_KEY` in Connect.
- RSS: Reliable, Scalable, Sellable. No secrets in chat or in git.

## What is live

- Coterie BOP/GL on **CO** for electrical, plumber, HVAC, fitness, beauty, cleaning, pet, painter.
- Bar and roofer are long-form only.
- Places autocomplete: CO + AZ UT NM WY NV ID KS NE OK TX. That is not a bind state.
- `COTERIE_PILOT_STATES` and `GUARD_PILOT_STATES` are CO.
- Connect: `https://connect.commercialinsurance-direct.com`. Demo login `g@commercialinsurance-direct.com` (Gerry forwards the OTP).
- Two-step demo: (1) fitness-demo sandbox quote, throw that policy away. (2) Connect golden Fitness policy `CSG-00507726-00`.
- Instant COI today is CID ACORD 25. Carrier paper is [`connect-coi-carrier.md`](./connect-coi-carrier.md). David has been asked for Generate COI and Add Additional Insureds. Do not scrape the Coterie dashboard. Do not fall back to CID ACORD on `coterie` or `guard`.

## What is not live

- GUARD WC is **built**. Jon signed off P-env. Partner-test works. Sandbox `offerWc` is true for beauty, cleaning, pet, fitness, plumber, electrical.
- Prod `cid-pdf-api` already has `GUARD_API_BASE` on `gigezrate`, the segment list, `CO`, SP name, and webhook auth. **`offerWc` is false** until GUARD generates `GUARD_API_KEY`, `GUARD_API_SECRET`, and `GUARD_CONTRACT_NUMBER`.
- Do not copy the sandbox key, secret, or `PAFAKE10` onto prod.
- Do not add `GUARD_CAPITA_PAY_URL` until GUARD sends the real template.
- Do not rebuild Electrical WC. After the three values are Live, smoke Electrical CO on the customer site (unique name, ZIP, FEIN), then the other five.
- HVAC class `5537` is off. Painter, bar, and roofer are not in the GUARD registry.
- Webhook `POST /webhooks/guard-docs` acks. Connect ingest is **16 October 2026**. GUARD cert adapter waits until Electrical WC is on the customer URL.
- Pet canonical domain is `petserviceinsurancedirect.com`.

## Docs

| Need | File |
|------|------|
| Dated calls | [`decisions-log.md`](./decisions-log.md) |
| Index | [`../DOCUMENTATION.md`](../DOCUMENTATION.md) |
| GUARD | [`Workers_Comp.md`](./Workers_Comp.md), [`guard-integration.md`](./guard-integration.md), [`guard-agent-handoff.md`](./guard-agent-handoff.md) |
| Coterie | [`coterie-integration.md`](./coterie-integration.md) |
| Connect app | `cid-connect/docs/ARCHITECTURE.md`, `WORKFLOW_HANDOFF.md` |
| Outreach | [`outreach-claude-playbook.md`](./outreach-claude-playbook.md) |

`~/GitHub/CID-docs/` and home-folder `*.md` files are pointers. `/Volumes/CID_Master/docs-snapshots/` is a read-only archive. Do not edit `CID_MASTER_OLD_DO_NOT_USE`.

---

## Lanes

Pick one. Stay in pdf-backend for anything that quotes, binds, or writes a policy.

### General

Read this file and the decisions log. Code for WC is done. The open prod gap is the three GUARD values.

### New carrier

A new carrier is a **new adapter on the existing spine**, not a new app.

1. Read how Coterie (`bind_source: coterie`, REST) and GUARD (`bind_source: guard`, SOAP) already land on one `submission_public_id`, two optional `policies` rows, and Connect.
2. Same six gates before build: headless quote/bind in our UI, webhooks, policy number plus documents into Connect, who is merchant of record, one intake, Connect as the servicing app. An embed or a required carrier portal is a no-go.
3. Code lives in **pdf-backend** only. Segment repos stay Netlify intake. No carrier secrets in the browser.
4. Connect COI for that carrier is carrier paper. Long-form (`boldsign`) keeps CID ACORD 25.
5. Gerry sends the partner email. Add a dated line to `decisions-log.md` when the go/no-go is made.
6. NEXT is not on the path. Revisit only for a hard gap, and only inside our UX. See the 2026-09 entry in the decisions log.

### GUARD go-live

Wait for GUARD to generate the production key, secret, and contract number. Paste them on **cid-pdf-api**. When that deploy is Live, Electrical CO config must return `offerWc: true` and `sandbox: false`. Then smoke. Details: [`guard-wc-rollout.md`](./guard-wc-rollout.md).

### Connect

Famous auth, insurance data through CID-PDF-API `/api/connect/*`. Do not deploy Connect to Render. Do not put service role in the bundle. Pet links use `petserviceinsurancedirect.com`.

### Outreach

Lists and Instantly CSV vars are `pdf-backend/scripts/` and [`outreach-claude-playbook.md`](./outreach-claude-playbook.md). `ch=` and `src=` are the same value. Do not use Zywave. Do not host campaign images on Render.

---

## First message for a new chat

```
CID agent start — read pdf-backend/docs/agent-start.md and docs/decisions-log.md before asking Gerry anything.

Lane: [general | new carrier | GUARD go-live | Connect | outreach].
Working on: [one sentence].
```
