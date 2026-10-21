# Workers’ Comp (GUARD) — due diligence + new-segment launch

> **As of:** 2026-10-19. **Carrier:** GUARD (W.R. Berkley).  
> **Customer URL:** live on production `cid-pdf-api` for Colorado beauty, cleaning, pet, fitness, plumber, and electrical. Prod `GUARD_ENABLED_SEGMENTS` is exactly `beauty,cleaning,pet,fitness,plumber,electrical`. Do not clear it.  
> **Next carrier or next state:** [`agent-start.md`](./agent-start.md) New carrier lane. This file is the WC product note, not a second status.  
> **Decisions:** [`decisions-log.md`](./decisions-log.md)

This file is the WC product note: what it is, and how a confirmed class attaches. The checklist is the New carrier lane.

---

## What it is

Optional **second line** on the same ConnectQuote submission as Coterie BOP/GL.

- Insured opts in on the segment ConnectQuote page → GUARD SOAP (NBQ indication → NBS questions → BND bind).
- **CID is not merchant of record.** GUARD bills the insured and emails pay info. Leave `GUARD_CAPITA_PAY_URL` unset. Do not put the bare `https://policyholder.guard.com/payment` link on the customer confirmation.
- Bind writes its own `policies` row (`bind_source: guard`). It does not wait for a Coterie BOP. `finalizeGuardBind` locks only the submission (`FOR UPDATE OF s`), commit `5d88d50`.
- Policy PDFs: `POST /webhooks/guard-docs` stores the carrier PDF (commit `25b97d0`). The policy card does not wait on PDFs. Ingest rules are step 3 of the New carrier lane.
- **COI:** WC certs are GUARD paper, requested in Connect. Do not fall back to CID ACORD 25. The cert adapter is still not built. Spec: [`connect-coi-carrier.md`](./connect-coi-carrier.md).
- **Left unbound.** A full WC quote (`NBS`) that is instant-bindable and not bound is a line on the ready-to-bind note. An indication (`NBQ`) is not. Flow: [`CID_ARCHITECTURE.md`](./CID_ARCHITECTURE.md).

**Do not** put operator / S4–S6 / WC API code in segment repos. WC runs only on **CID-PDF-API** (`pdf-backend`).

---

## Canonical files (this folder)

| File | Use |
|------|-----|
| [guard-integration.md](./guard-integration.md) | Spec — SOAP, NBQ/NBS/BND/SBR, Connect row, webhook path |
| [guard-wc-rollout.md](./guard-wc-rollout.md) | Flip WC on for a segment/state (registry + Render env + smoke) |
| [guard-uat-runbook.md](./guard-uat-runbook.md) | P-env / partner-test |
| [guard-agent-handoff.md](./guard-agent-handoff.md) | What the next agent must not re-ask |
| [Deploy_Guide.md](./Deploy_Guide.md) | Render env table (sandbox vs prod) |
| [connectquote-segment-deploy.md](./connectquote-segment-deploy.md) | URL → launch for a new segment, including WC once BOP is live |

---

## URL → launch (every new segment)

Do **BOP/GL first** (domain, Netlify, registry, Gmail, poller, CO quote). Full steps: **`connectquote-segment-deploy.md`**.

Then WC, only if GUARD has confirmed class for that trade and state. That is step 5 of the New carrier lane, not a new integration.

1. **`guardRegistry.js`** — set `wcEnabled: true` for that line; NCCI class + suffix from Jon (CO plumber is `518322`).
2. **Render prod `cid-pdf-api`** — add the segment to `GUARD_ENABLED_SEGMENTS`. Do not clear the live list. `GUARD_PILOT_STATES` stays `CO` until that one state is smoked. Leave `GUARD_CAPITA_PAY_URL` unset. Prod base stays `gigezrate`. Do not copy sandbox or `PAFAKE10`.
3. Bump segment **`connectquote.html?v=`** so intake JS picks up WC.
4. **Smoke on the live customer URL** (unique name / ZIP / FEIN): BOP quote → WC indication → bindable premium or a GUARD notice. Do not use partner-test as the launch smoke.
5. Then marketing WC copy.

**Off:** HVAC (`wcEnabled: false`, class `5537`). Painter, bar, and roofer are not in the registry.

**10 states:** Places already allows CO + AZ UT NM WY NV ID KS NE OK TX. Both carriers approved that ten on 19 October 2026. They are not bind states. Add a state only via `GUARD_PILOT_STATES` + class suffix + one smoke bind.

---

## Diligence one-liner

ConnectQuote is dual-rail: **Coterie** BOP/GL (CID not merchant of record) + **GUARD** WC (SOAP; GUARD direct bill). Same `submission_public_id`, two `policies` rows, both surface in CID Connect after the insured signs in. Colorado WC is live for the six trades above.

---

## Partner-test (GUARD only)

P-env form on CID-PDF-API sandbox `/partner-test/guard-wc.html`. Not the customer URL.
