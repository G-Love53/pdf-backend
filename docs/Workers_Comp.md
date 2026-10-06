# Workers’ Comp (GUARD) — due diligence + new-segment launch

> **As of:** 2026-10-06. **Carrier:** GUARD (W.R. Berkley).  
> **Customer URL:** not offering WC yet. Sandbox is signed off. Prod waits on GUARD to generate the API key, secret, and contract number. Do not copy sandbox or `PAFAKE10`.  
> **Decisions:** [`decisions-log.md`](./decisions-log.md)

This is the **start-here** for WC: what it is, where it lives, and how it attaches when you launch a segment. It is **not** a second spec.

---

## What it is

Optional **second line** on the same ConnectQuote submission as Coterie BOP/GL.

- Insured opts in on the segment ConnectQuote page → GUARD SOAP (NBQ indication → NBS questions → BND bind).
- **CID is not merchant of record.** GUARD bills the insured. The Capita pay URL stays unset until GUARD sends the real template.
- Bind writes a `policies` row (`bind_source: guard`) for **CID Connect**.
- Policy PDFs: GUARD document webhook on **16 October 2026** → vault. The policy card does not wait on PDFs.
- **COI:** WC certs run **through GUARD**, requested in Connect — not a CID ACORD 25. Adapter after Electrical is live on the customer URL. Spec: [`connect-coi-carrier.md`](./connect-coi-carrier.md).

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

Then WC, only if GUARD has confirmed class for that trade and state:

1. **`guardRegistry.js`** — set `wcEnabled: true` for that line; NCCI class + suffix from Jon (CO plumber is `518322`).
2. **Render prod `cid-pdf-api`**
   - `GUARD_ENABLED_SEGMENTS` includes the segment (and parent, e.g. `fitness`)
   - `GUARD_PILOT_STATES` includes the state (`CO` until expansion)
   - Prod key, secret, and contract number from GUARD (not the sandbox trio)
   - `GUARD_CAPITA_PAY_URL` only when GUARD sends the template
   - `GUARD_WEBHOOK_AUTH` is already set
3. Bump segment **`connectquote.html?v=`** so intake JS picks up WC.
4. **Smoke on the live URL** (unique name / ZIP / FEIN): BOP quote → WC indication → bindable premium or a GUARD notice. Do not use partner-test as the launch smoke.
5. Then marketing WC copy.

**Off:** HVAC (`wcEnabled: false`, class `5537`). Painter, bar, and roofer are not in the registry.

**10 states:** Places already allows CO + AZ UT NM WY NV ID KS NE OK TX. GUARD does not. Add a state only via `GUARD_PILOT_STATES` + class suffix + one smoke bind.

---

## Diligence one-liner

ConnectQuote is dual-rail: **Coterie** BOP/GL (CID not merchant of record) + **GUARD** WC (SOAP; GUARD direct bill). Same `submission_public_id`, two `policies` rows, both surface in CID Connect after the insured signs in. WC appears on the customer site only after the production credentials are on `cid-pdf-api` and Electrical CO has been smoked.

---

## Partner-test (GUARD only)

P-env form on CID-PDF-API sandbox `/partner-test/guard-wc.html`. Not the customer URL.
