# ConnectQuote — shipped summary (2026-06-10 → 2026-06-12)

> **Canonical “what we built” doc** for investors, Claude context, and team handoff.  
> **Technical spec:** [`coterie-integration.md`](./coterie-integration.md) · **Demo script:** [`connectquote-build-day.md`](./connectquote-build-day.md)

---

## Executive summary

**Investor deck (one line):** ConnectQuote is **nationwide live**, gated only by **carrier appetite** and **state licensing availability** — not by a fixed state pilot.

**ConnectQuote** is CID’s **instant quote-and-bind rail** via **Coterie API v1.6**, deployed on **Electrical** and **Fitness** (yoga, pilates, personal trainer). Insureds complete a **segment-branded** thin intake → receive a **bindable premium** → pay through **Coterie’s Stripe** (**CID is not merchant of record**) → land in **CID Connect** same day with a policy row in **cid-postgres** (`bind_source: coterie`).

**Geography:** Product and architecture are **nationwide-ready**. Coterie **`AKHash`** appetite and **producer licensing per state** determine where bindable quotes succeed. Sandbox demos use **CO**; expanding states is configuration + licensing, not a rebuild.

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
| **Merchant of record** | **Coterie / their Stripe** collects premium — see **Payment & merchant of record** below |
| **Geography** | **Nationwide live**, gated by **AKHash appetite** + **state producer licensing** (see Executive summary) |

---

## Payment & merchant of record (compliance — locked)

**Commercial Insurance Direct LLC is not the merchant of record (MoR) on the ConnectQuote / Coterie instant rail.**

| Question | Answer (Coterie rail, v1) |
|----------|---------------------------|
| Who charges the insured’s card? | **Coterie** (via **their** Stripe Connect / embedded checkout) |
| Who is MoR for the premium payment? | **Coterie** (and underlying admitted carrier paper), **not CID** |
| Does CID hold or route premium funds? | **No** — no CID Stripe **secret** key, no CID merchant account on this rail |
| What Stripe key appears in the browser? | **`COTERIE_STRIPE_PUBLISHABLE_KEY`** only (Coterie’s publishable pk, Render env) |
| What does the bind API send? | **`stripeToken`** (`tok_…` from Stripe.js) to Coterie bind — **not** a CID payment intent |
| PCI scope for CID on this rail | **Reduced** — card data touches Stripe/Coterie; CID does not process or store PAN |

**What CID still owns:** agency distribution, intake UX, submission/policy rows in cid-postgres, insured service in **Connect** (vault, COI, Am I Covered), ops via segment **`quotes@…`**.

**What CID must not do on this rail (without explicit re-architecture + compliance review):**

- Add a **CID Stripe** account or **`sk_`** secret for ConnectQuote bind
- Present CID as the party “charging your card” in copy or receipts
- Commingle instant-rail premiums with CID bank accounts

### Future instant rails (Thimble, other MGAs/APIs)

When adding another instant bind partner, **document MoR per rail** in this file and in [`compliance-roadmap.md`](./compliance-roadmap.md) before production:

| Rail | MoR (expected) | Payment surface | CID role |
|------|----------------|-----------------|----------|
| **Coterie (ConnectQuote v1)** | **Coterie / their Stripe** | Coterie Stripe embed on segment intake | Agency + Connect service; not MoR |
| **Thimble (future)** | _TBD — confirm in partner agreement_ | _TBD (likely partner-hosted or partner Stripe)_ | Same pattern unless contract says otherwise |
| **Traditional S6 (BoldSign)** | Carrier / billing per bind workflow | Outside instant Stripe embed | Full supplement + ops bind |

**Rule:** Do not assume all instant rails share Coterie’s payment model. Each new partner requires an explicit **MoR + PCI + premium flow** row before ship.

See also: [`coterie-integration.md`](./coterie-integration.md) · [`partnerships.md`](./partnerships.md) (Stripe via Coterie row) · [`VENDORS_S1_S6_CONNECT.md`](./VENDORS_S1_S6_CONNECT.md).

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

## Segments & AKHashes

| Segment | `business_class` | Products (owner) | Non-owner |
|---------|------------------|-------------------|-----------|
| **electrical** | `electric_contracting` | BOP (+ optional GL add-on) | Traditional (ownerOnly) |
| **fitness** | `yoga_studio` | GL | GL |
| **fitness** | `pilates_studio` | BOP + GL toggles | GL |
| **fitness** | `personal_trainer` | GL | GL |

**GL limits (all segments):** default **$1M each occurrence** / **$2M aggregate** — insured can change on intake.

Registry: `src/config/coterieRegistry.js` · Intake schema: `src/config/connectQuoteIntakeSchema.js`

### Yoga / GL-only — what Coterie needs

| Field | On intake | Notes |
|-------|-----------|--------|
| **Employees** | Core form (`num_employees`) | Always shown — maps to Coterie `numEmployees` |
| **Revenue, payroll, years in business** | **Business rating details** section | Required by Coterie bindable for **GL-only** paths too (not just BOP) |
| **GL limits** | Pre-selected **$1M / $2M** | Changeable |

**ConnectQuote-only UX:** Professional liability and other non-instant products are **not shown** on ConnectQuote intake — avoids confusing insureds with options we cannot bind instantly. Ops can still handle PL via traditional workflow off-segment if needed.

### Professional liability (not on ConnectQuote)

Yoga’s Coterie **`AKHash`** supports **GL on the instant bindable API** only. **PL is omitted from ConnectQuote UI** (no toggle, no redirect to full application on this page). When Coterie enables **PL on bindable** for this class, we add it as a coverage toggle — same pattern as BOP/GL.

---

## Intake UX (investor-facing)

1. **Campaign prefill** — `fn`, `ln`, `em`, `ad`, `ct`, `st`, `zp`, `bn`, `bc`, `src`, `cid`
2. **Core questions** — contact, location, owner?, business type, employees
3. **Smart sections** (after owner + type selected):
   - Coverage toggles (BOP / GL only — instant-bind products)
   - **Business rating details:** sales, payroll, years in business *(Select… until chosen)* — **shown for GL-only (yoga/trainer) and BOP**
   - Property deductible *(BOP only)*
   - GL limits — **default $1M / $2M**, changeable
   - Policy start date *(Select date)*
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
| **Merchant of record** | **CID is not MoR** on ConnectQuote — **Coterie/Stripe** collects premium; see **Payment & merchant of record** above |
| **PCI** | Card entry via Coterie’s Stripe.js embed; CID has no `sk_` Stripe key on this rail |
| **PII** | Submission + quote in cid-postgres; Coterie as processor — DPA TBD |
| **SOC 2** | CID not certified; infra on Render/Netlify/GitHub SOC 2 Type II — see `compliance-roadmap.md` |
| **CO producer license** | Enabled in sandbox — bindable quotes returning premium (e.g. electrical ~$1,448/yr tested) |
| **Issued policy PDF** | Not yet ingested from Coterie webhook — Connect uses summary + KB for Am I Covered v1 |

---

## Demo URLs (sandbox — CO example)

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
| 2026-06-12 | Explicit **CID not MoR** / Stripe-via-Coterie compliance section; future-rail template (Thimble) |
| 2026-06-12 | Nationwide investor positioning; yoga GL rating fields; GL $1M/$2M defaults; PL rationale |
