# CID × Coterie — ConnectQuote integration (sandbox)

> **Canonical location (RSS):** `pdf-backend/docs/coterie-integration.md`  
> **As of:** 2026-06-10 (America/Denver). Update when API behavior, pilots, or env change.
>
> **Shipped summary:** [`connectquote-shipped-2026-06.md`](./connectquote-shipped-2026-06.md)
>
> **Related:** [`corporate-structure.md`](./corporate-structure.md) (quote rails) · [`partnerships.md`](./partnerships.md) · [`Deploy_Guide.md`](./Deploy_Guide.md) (Render env) · AKHash workbook (local ops — **not in repo**).

**Purpose:** Technical spec for the **ConnectQuote** instant rail via Coterie API v1.6. Partner-facing story stays segment intake + `quotes@` ops — see `corporate-structure.md`.

---

## Status (2026-06-12)

| Item | State |
|------|--------|
| Agency appointment | **Signed** — All Access Insurance (CO), dba Commercial Insurance Direct · Rick Cline · (303) 932-1700 · info@commercialinsurance-direct.com |
| Sandbox credentials | **Live on Render** — never commit |
| Create Application | **Validated** — Electrical + Fitness AKHashes |
| Bindable Quote | **Working in CO sandbox** — premiums returned (e.g. electrical BOP ~$1,448/yr) |
| Bind / payment | **Stripe `tok_` bind wired**; **demo-finalize** for investor demos |
| Pilot geography | **CO only** (v1) |
| Pilot segments | **Electrical** + **Fitness** (yoga, pilates, personal trainer) |
| Intake UI | Segment `connectquote.html` + shared `/static/connectquote-intake.js` |
| Webhook | `POST /webhooks/coterie` skeleton — production doc ingest **TBD** |
| Connect handoff | **Live** — Open Connect button + bind token / email prefill |

---

## Architecture (locked)

```text
Campaign / organic → segment connectquote.html (URL prefill)
    → shared intake (coverage toggles + Coterie rating fields)
    → CID-PDF-API POST /api/coterie/connectquote
    → POST /v1.6/commercial/applications
    → POST /v1.6/commercial/quotes/bindable
    → bind / Stripe (Coterie) OR demo-finalize (sandbox)
    → policy row (S6-lite) → Connect invite
```

- **Traditional rail** unchanged (full `*_INTAKE` bundle, BoldSign S6).
- **`bind_source`:** `coterie` vs `boldsign` — Connect reads the same bridge.
- **No Coterie secrets** in segment repos or markdown.

---

## Sandbox API

| Item | Value |
|------|--------|
| Base URL | `https://api-sandbox.coterieinsurance.com` |
| Auth header | `Authorization: token {COTERIE_PUBLISHABLE_KEY}` |
| API version path | `/v1.6/commercial/...` |
| Agency attribution | `agencyExternalId` = `{COTERIE_AGENCY_EXTERNAL_ID}` |
| Business class | **`AKHash`** (exact casing) on application and bindable quote |

### Render env (CID-PDF-API only)

| Variable | Purpose |
|----------|---------|
| `COTERIE_API_BASE` | `https://api-sandbox.coterieinsurance.com` (prod URL TBD) |
| `COTERIE_PUBLISHABLE_KEY` | Partner publishable key |
| `COTERIE_AGENCY_EXTERNAL_ID` | Agency UUID from Coterie |
| `COTERIE_STRIPE_PUBLISHABLE_KEY` | Browser Stripe pk for Coterie bind (safe for intake page) |
| `COTERIE_DEMO_FINALIZE_ENABLED` | `true` in sandbox — demo bind without live charge |
| `COTERIE_WEBHOOK_SECRET` | When webhook registration provides one (TBD) |

---

## Create Application

`POST /v1.6/commercial/applications`

**Required for pilot (minimum validated shape):**

- `legalBusinessName`, `businessState`, `businessZip`, `numEmployees`
- `agencyExternalId`
- **`AKHash`** — from intake business-class step (no generic trade fallback)
- `email` — insured contact
- `locations` — at least `{ zip }` (primary location)

**Useful response fields:**

- `application.applicationId` — reuse on bindable quote
- `availablePolicyTypes` — e.g. `["BOP","GL"]`
- `exclusions` — map to intake disqualifiers / traditional rail
- `application.applicationUrl` — optional hosted handoff (prefer API + owned form)
- `application.status` — may show `FailedExtendedValidation` until extended fields complete; still returns policy types when appetite OK

### Electrical pilot AKHash (workbook v2-10)

| Use case | AKHash | Notes |
|----------|--------|--------|
| Electric contracting (primary work) | `1520d13449f07456570fa1048b4bd7c4` | NAICS 238210; confirm primary work with Coterie |
| Solar (example prohibited) | `88ac9df8…` | Route to **traditional** rail |

Full mapping: local file `Coterie AKHash 06-04-2026-V2-10.xlsx` — sheet **BOP GL Appetite**.

---

## Bindable Quote

`POST /v1.6/commercial/quotes/bindable`

**Validated shape (in addition to application fields):**

- `applicationId` — from create application
- `applicationTypes` — e.g. `["BOP"]`
- `agencyExternalId`, **`AKHash`**
- **`contactEmail`** — insured email (not `email` on this endpoint)
- **`locations`** — full address: `street`, `city`, `state`, `zip`, `isPrimaryLocation`
- Limits — e.g. `glLimit`, `glAggregateLimit`, `glAggregateProdLimit`
- `policyStartDate` — e.g. `06/01/2026`

**Producer licensing:** Appointment paperwork is signed (Rick Cline / All Access). Ask Coterie to attach Rick’s **CO** (and future state) producer license to our `agencyExternalId` so bindable quotes clear `E0122`.

---

## Intake + campaigns

- Prefill URL params: `pdf-backend/src/outreach/urlBuilder.js` (`fn`, `ln`, `em`, `st`, `zp`, `bn`, …).
- Campaign links → **segment** `/quote?...&st=CO` — not Coterie `applicationUrl` directly.
- Coterie requires **narrowed business class** — one form step → `AKHash`.
- Application `exclusions` + Appetite Checker → traditional rail when matched.

---

## Post-bind (Connect)

1. Coterie policy webhook → `/webhooks/coterie`
2. Idempotent `createPolicy()` (same outcome as BoldSign completion)
3. Fetch/store policy docs → R2
4. `sendBindConfirmationEmail` / `sendWelcomeEmail` + Connect (`CID_APP_URL`)
5. Same-day Connect invite — carrier bind email does not replace CID welcome

---

## Code map (CID-PDF-API)

| Path | Role |
|------|------|
| `src/config/coterieRegistry.js` | Segment business classes, AKHash, coverage toggles |
| `src/config/connectQuoteIntakeSchema.js` | Coterie rating fields + conditional sections |
| `src/config/coterieAkHash.js` | AKHash resolution; CO pilot states |
| `src/services/coterieService.js` | Coterie API client + bindable payload builder |
| `src/services/coterieIntakeService.js` | ConnectQuote orchestration (submission + quote) |
| `src/services/coterieBindCompletion.js` | Bind + demo-finalize → policy + emails |
| `src/routes/coterieRoutes.js` | `/api/coterie/*` |
| `public/connectquote-intake.js` | Shared browser intake (segment Netlify shells) |
| `public/connectquote-intake.css` | Shared intake styles |
| `src/routes/webhooks.js` | `POST /webhooks/coterie` |
| `docs/coterie-sandbox-fixtures.md` | Redacted request/response examples |

**Intake endpoint:** segment ConnectQuote form POSTs to `POST /api/coterie/connectquote` (not `/submit-quote`). Traditional `*_INTAKE` bundle flow unchanged.

**E0122 handling:** bindable quote failure returns `coterie.bindBlocked` — submission still recorded; no hard error to insured when only producer license is missing.

---

## Webhook shape (TBD)

Register URL: `https://cid-pdf-api.onrender.com/webhooks/coterie`

| Field | Status |
|-------|--------|
| Event types for bind complete | **TBD** with Coterie (placeholder: `policy.bound`) |
| Signature header | **TBD** — optional `COTERIE_WEBHOOK_SECRET` env |
| Correlation key | Likely `applicationId` → `submissions.raw_submission_json` / future `coterie_application_id` column |
| Idempotency | Event id dedupe before `createPolicy()` |

See redacted examples in [`coterie-sandbox-fixtures.md`](./coterie-sandbox-fixtures.md).

---

## Open items

- [ ] Coterie issued-policy PDF webhook → R2 → Connect vault
- [ ] Fitness GL-only bindable — ensure payroll/sales sent when Coterie requires on GL path
- [ ] Welcome email + PWA install hint on bind success card
- [ ] Coterie: enable Rick Cline producer license on agency + issue **production** API/Stripe keys
- [ ] Partner DPA / multi-state registry expansion
- [x] CO sandbox bindable quote + demo finalize → Connect
- [x] Electrical + Fitness intake on Netlify
- [x] Extended Coterie fields + coverage toggles on intake
- [x] Stripe token bind + annual/monthly plan cards

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-04 | Initial spec: sandbox validated, AKHash field, bindable shape, CO blocker, env names. |
| 2026-06-10 | Code skeleton: connectquote intake, coterieService, webhook ack, fixtures doc, E0122 graceful path. |
| 2026-06-12 | **Shipped sandbox E2E:** bindable quotes, demo-finalize, Connect handoff, Fitness segment, extended intake UI, plan cards. See `connectquote-shipped-2026-06.md`. |
| 2026-06-10 | Carrier appointment signed — All Access Insurance, Rick Cline, dba Commercial Insurance Direct. |
