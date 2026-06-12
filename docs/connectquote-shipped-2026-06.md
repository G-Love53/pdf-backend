# ConnectQuote — shipped summary (2026-06-10 → 2026-06-12)

> **Canonical “what we built” doc** for investors, Claude context, and team handoff.  
> **Technical spec:** [`coterie-integration.md`](./coterie-integration.md) · **Demo script:** [`connectquote-build-day.md`](./connectquote-build-day.md)

---

## Executive summary

**ConnectQuote** is CID’s **instant quote-and-bind rail** via **Coterie API v1.6**, live in **sandbox** for **Colorado** on **Electrical** and **Fitness** (yoga, pilates, personal trainer). Insureds complete a **segment-branded** thin intake → receive a **bindable premium** → pay through **Coterie’s Stripe** (CID is **not** merchant of record) → land in **CID Connect** same day with a policy row in **cid-postgres** (`bind_source: coterie`).

**Traditional S6 (BoldSign)** is unchanged for full supplement / non-appetite risks.

---

## Architecture (locked)

```text
Campaign URL prefill → segment Netlify connectquote.html
    → shared intake JS/CSS from CID-PDF-API (/static/connectquote-intake.*)
    → POST /api/coterie/connectquote (pdf-backend only)
    → Coterie: POST /v1.6/commercial/applications
    → Coterie: POST /v1.6/commercial/quotes/bindable
    → Stripe token (tok_…) → POST /api/coterie/bind OR sandbox demo-finalize
    → createPolicy() + timeline + welcome/bind email + Connect URL
```

| Rule | Detail |
|------|--------|
| **Single backend** | All Coterie code on **`pdf-backend`** (Render: `cid-pdf-api.onrender.com`) |
| **Segment repos** | Netlify HTML shell only — **no** duplicated operator/S4–S6 |
| **Secrets** | `COTERIE_*` on Render only — never in segment repos or browser bundle (except Coterie Stripe **publishable** pk) |
| **Customer ownership** | Connect vault, COI, Am I Covered — **not** Coterie insured portal |
| **Payment** | Coterie Stripe embed; bind payload uses **`stripeToken`** (`tok_…`), not PaymentMethod `pm_…` |
| **Pilot geography** | **CO only** (`COTERIE_PILOT_STATES`) |

---

## Deploy footprint

| Surface | Host | Deploy trigger |
|---------|------|----------------|
| **CID-PDF-API** | Render (`pdf-backend` `main`) | Git push → auto deploy |
| **Intake assets** | `public/connectquote-intake.js` + `.css` at `/static/…` | Same Render deploy |
| **Electrical intake** | `electricalinsurancedirect.com/connectquote.html` | `electrical-pdf-backend` → Netlify |
| **Fitness intake** | `fitnessinsurancedirect.com/connectquote.html` | `fitness-pdf-backend` → Netlify (git-connected `netlify.toml`) |
| **Connect PWA** | Netlify (`cid-connect`) | Separate; reads policies via bridge |

### Render env (CID-PDF-API)

| Variable | Purpose |
|----------|---------|
| `COTERIE_API_BASE` | `https://api-sandbox.coterieinsurance.com` |
| `COTERIE_PUBLISHABLE_KEY` | Coterie API auth (server + safe publishable pattern) |
| `COTERIE_AGENCY_EXTERNAL_ID` | Agency UUID on all Coterie bodies |
| `COTERIE_STRIPE_PUBLISHABLE_KEY` | Browser Stripe for Coterie bind (`pk_test_…`) |
| `COTERIE_DEMO_FINALIZE_ENABLED` | `true` in sandbox — **Demo: simulate bind** without live charge |

---

## Segments & AKHashes (CO sandbox)

| Segment | `business_class` | Products (owner) | Non-owner |
|---------|------------------|-------------------|-----------|
| **electrical** | `electric_contracting` | BOP (+ optional GL add-on) | Traditional (ownerOnly) |
| **fitness** | `yoga_studio` | GL (+ PL → traditional) | GL |
| **fitness** | `pilates_studio` | BOP + GL toggles | GL |
| **fitness** | `personal_trainer` | GL | GL |

Registry: `src/config/coterieRegistry.js` · Intake schema: `src/config/connectQuoteIntakeSchema.js`

---

## Intake UX (investor-facing)

1. **Campaign prefill** — `fn`, `ln`, `em`, `ad`, `ct`, `st`, `zp`, `bn`, `bc`, `src`, `cid`
2. **Core questions** — contact, location, owner?, business type, employees
3. **Smart sections** (after owner + type selected):
   - Coverage toggles (BOP / GL / PL handoff)
   - BOP rating: sales, payroll, years in business, BPP deductible *(blank Select… until chosen)*
   - GL limits *(blank until chosen)*
   - Policy start date *(blank until chosen)*
4. **Quote** — premium returned from Coterie bindable
5. **Pay plan** — clickable **annual vs monthly** cards (not dropdown)
6. **Bind** — Pay & bind (Stripe) or **Demo simulate bind** (sandbox)
7. **Success** — **Open CID Connect** (email + bind token prefill)

Shared client: `/static/connectquote-intake.js` · Schema API: `GET /api/coterie/intake-schema/:segment/:businessClass`

---

## API endpoints (CID-PDF-API)

| Method | Path | Role |
|--------|------|------|
| GET | `/api/coterie/config` | Stripe pk, demo flag (browser-safe) |
| GET | `/api/coterie/registry/:segment` | Business classes + intake schemas |
| GET | `/api/coterie/intake-schema/:segment/:class` | Conditional fields for UI |
| POST | `/api/coterie/connectquote` | Submission + Coterie app + bindable quote |
| POST | `/api/coterie/bind` | Live bind with Stripe token |
| POST | `/api/coterie/demo-finalize` | Sandbox policy spine without charge |
| POST | `/webhooks/coterie` | Skeleton ack (production finalize TBD) |

---

## Compliance & vendor notes

| Topic | Status |
|-------|--------|
| **PCI** | Insured pays **Coterie/Stripe** — CID not MoR on instant rail |
| **PII** | Submission + quote in cid-postgres; Coterie as processor — DPA TBD |
| **SOC 2** | CID not certified; infra on Render/Netlify/GitHub SOC 2 Type II — see `compliance-roadmap.md` |
| **CO producer license** | Enabled in sandbox — bindable quotes returning premium (e.g. electrical ~$1,448/yr tested) |
| **Issued policy PDF** | Not yet ingested from Coterie webhook — Connect uses summary + KB for Am I Covered v1 |

---

## Demo URLs (CO)

**Electrical:**  
`https://electricalinsurancedirect.com/connectquote.html?fn=Demo&ln=Insured&em=g%40commercialinsurance-direct.com&ad=123+Main+St&ct=Denver&st=CO&zp=80202&bn=Demo+Electric+LLC&src=demo&cid=build-day`

**Fitness pilates:**  
`https://fitnessinsurancedirect.com/connectquote.html?fn=Demo&ln=Insured&em=g%40commercialinsurance-direct.com&ad=123+Main+St&ct=Denver&st=CO&zp=80202&bn=Demo+Pilates+Studio&bc=pilates_studio&src=demo&cid=build-day`

**Demo account:** `g@commercialinsurance-direct.com`

---

## Verified sandbox (2026-06-12)

- [x] CO electrical bindable quote + premium
- [x] Demo finalize → policy row + Connect
- [x] Stripe token bind path wired
- [x] Extended Coterie fields exposed (user-selected, not hidden defaults)
- [x] Annual/monthly plan cards on quote screen
- [x] Fitness registry (3 classes) on API
- [ ] Fitness GL-only bindable (may need always-send payroll/sales on API — next session)
- [ ] Coterie issued-policy PDF webhook ingest
- [ ] Welcome email + PWA hint on success card (planned)
- [ ] Production keys / multi-state

---

## Repos touched

| Repo | What shipped |
|------|----------------|
| `pdf-backend` | Coterie adapter, registry, intake schema, routes, bind completion, static intake JS |
| `electrical-pdf-backend` | `Netlify/connectquote.html` + index banner |
| `fitness-pdf-backend` | `Netlify/connectquote.html` + index banner |
| `cid-connect` | Logo scale, post-bind PWA hint (earlier in sprint) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-10 | Initial ConnectQuote rail: electrical CO, demo bind, Connect handoff |
| 2026-06-12 | Fitness segment; extended Coterie fields; coverage toggles; plan cards; static asset fix |
