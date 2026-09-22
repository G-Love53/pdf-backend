# ConnectQuote analytics — partner summary

> **Audience:** carriers, agency partners, diligence (no secrets).  
> **Technical runbook:** [`connectquote-events-tracking.md`](./connectquote-events-tracking.md) · **Operator SQL:** [`connectquote-operator-learning.md`](./connectquote-operator-learning.md)

---

## Overview

CID instruments the ConnectQuote journey on segment landing pages using **first-party analytics only** (no third-party ad trackers). We record how prospects move from campaign link to quote and bind, by **segment**, **state**, and **email sequence step**.

**One line:** Carriers see the bound policy; CID sees the path — who landed, where they stopped, and what they needed before and after purchase.

---

## What we track

| Layer | Examples |
|-------|----------|
| **Campaign attribution** | Channel, campaign ID, outreach step (`seq=1\|2\|3`) |
| **Page funnel** | Landing, human engagement, intake progress (business type, contact, location, coverage), disqualifications, exit stage |
| **Quote flow** | Quote requested / returned (response time), errors, bind clicks |
| **Submission & bind** | Successful submits, quoted premium, bound policies (operator pipeline) |

### Funnel stages (page behavior)

| Stage | Meaning |
|-------|---------|
| Open | Landed; little or no engagement |
| Semi-filled | Started intake; no quote yet |
| Stale | Open or semi-filled; idle ~30+ minutes without quote |
| Quoted, not bound | Premium shown; no bind (confirmed against policy records when submit exists) |
| Disqualified | Routed to traditional intake or ineligible (e.g. non-owner) |

---

## What we do not track in analytics

- **Prefill values** — we log which fields were *present* in the URL, not names, emails, or addresses in the analytics payload  
- **Third-party pixels** — no Meta, Google Ads, or email-platform scripts on intake pages  
- **Cross-site tracking** — analytics stay on CID-controlled surfaces and our API  

Privacy notice on segment quote pages: *first-party visit and form-progress analytics to improve the service.*

---

## Why it matters for partners

| Partner view | CID view |
|--------------|----------|
| Bound policy, premium, class | Full funnel: clicks → form progress → quote → bind |
| Aggregate appetite outcomes | Drop-off by segment, step, and campaign before submit |
| Post-bind servicing (limited) | ConnectQuote + Connect path on one submission spine (`submission_public_id`) |

This supports **conversion improvement**, **campaign attribution**, and **honest volume discussions** without relying on email open/click metrics alone (which overstate real engagement on HTML steps).

---

## Data location (internal reference for diligence)

| Store | Role |
|-------|------|
| `cq_events` | Pre-submit page funnel (Postgres, CID-PDF-API) |
| `submissions`, `timeline_events`, `policies` | Submit, quote, bind (existing audit trail) |

Partner-facing reports use **aggregates by segment and state**; carrier names and non-public contract details can be omitted from external exports.

---

## Related documents

| Doc | Use |
|-----|-----|
| [`connectquote-shipped-2026-06.md`](./connectquote-shipped-2026-06.md) | Product scope and CO marketing rail |
| [`coterie-integration.md`](./coterie-integration.md) | Coterie API technical spec |
| [`AUDIT_READINESS.md`](./AUDIT_READINESS.md) | S1–S6 audit posture |
