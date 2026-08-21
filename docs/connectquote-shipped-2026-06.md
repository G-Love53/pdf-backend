# ConnectQuote — shipped summary (2026-06-10 → 2026-08-18)

> **Canonical “what we built” doc** for investors, Claude context, and team handoff.  
> **Technical spec:** [`coterie-integration.md`](./coterie-integration.md) · **Demo script:** [`connectquote-build-day.md`](./connectquote-build-day.md) · **Operator learning (saved spec):** [`connectquote-operator-learning.md`](./connectquote-operator-learning.md) · **Instantly outreach:** [`outreach-claude-playbook.md`](./outreach-claude-playbook.md) · **Email creatives:** [`outreach-creatives.md`](./outreach-creatives.md)

---

## Executive summary

**Investor deck (one line):** ConnectQuote architecture is **nationwide-ready**; **marketing and instant bind today are Colorado (CO) only** until CID expands pilot states and Coterie confirms producer licensing + appetite per state.

**ConnectQuote** is CID’s **instant quote-and-bind rail** via **Coterie API v1.6**, deployed for **Colorado (CO) marketing** on **Electrical**, **Fitness** (yoga, pilates, personal trainer — three marketable classes), **HVAC**, **Plumber**, **Beauty**, **Cleaning**, and **Pet**. Insureds complete a **segment-branded** thin intake → receive a **bindable premium** → pay through **Coterie’s Stripe** (**CID is not merchant of record**) → land in **CID Connect** at **`https://connect.commercialinsurance-direct.com`** same day with a policy row in **cid-postgres** (`bind_source: coterie`).

**Bar** and **Roofer** are **not** on ConnectQuote (traditional intake only).

**Geography:** Product code supports adding states via config (`COTERIE_PILOT_STATES` in `src/config/coterieAkHash.js`). **Do not market outside CO** until both CID and Coterie gates are cleared for that state (see **Marketing geography** below).

**Traditional S6 (BoldSign)** is unchanged for full supplement / non-appetite risks. **Bar** and **Roofer** are **not** on ConnectQuote (traditional intake only).

---

## Marketing geography — who decides eligible states?

**Three layers — all must pass for a successful instant quote + bind:**

| Layer | Who controls it | What it is | Today (Jul 2026) |
|-------|-----------------|------------|------------------|
| **1. CID marketing gate** | **CID** (code + ops decision) | `COTERIE_PILOT_STATES` in `src/config/coterieAkHash.js` — intake API returns `CONNECTQUOTE_STATE_NOT_SUPPORTED` for other states | **`CO` only** |
| **2. Producer licensing** | **Coterie + agency** (Rick Cline / All Access) | Coterie error **`E0122`** if producer license not attached to agency for that state | **CO** confirmed for appointment; expand per state with Coterie |
| **3. Carrier appetite** | **Coterie** (AKHash + UW) | Business class hash + state + answers → bindable quote or declination / traditional rail | Per class in `coterieRegistry.js`; plumber has intake knockouts |

**For marketing creative (Claude, Instantly, FB, etc.):**

- **Target geography:** **Colorado only** — use `st=CO` and CO zips in every ConnectQuote URL until CID explicitly expands layer 1.
- **Do not** promise instant bind in other states based on “nationwide-ready architecture” alone.
- **To add a state later:** (a) Coterie attaches Rick’s producer license for that state, (b) smoke bindable quote in sandbox/prod, (c) CID adds state to `COTERIE_PILOT_STATES`, redeploy API, (d) update campaign geo.

**Segments on ConnectQuote marketing rail (CO):** Electrical, HVAC, Plumber, Beauty, Cleaning, Pet, Fitness (**3 classes** = yoga, pilates, personal trainer — each a different policy/price). **Not** Bar, **not** Roofer. Instantly list cleaner: `CONNECTQUOTE_MARKETING_READY` in `connectQuoteLinks.js`.

**Contractor segments (Electrical, HVAC, Plumber):** market to **business owners / operators** only (see `ownerOnly` in registry). Fitness is not owner-gated.

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
| **Geography** | **Nationwide-ready code**; **market CO only** until `COTERIE_PILOT_STATES` + Coterie licensing expanded (see **Marketing geography** above) |

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
| **HVAC intake** | `hvacinsurancedirect.com/connectquote.html` | Live — CO Instantly / ConnectQuote |
| **Plumber intake** | `plumberinsurancedirect.com/connectquote.html` | Live — CO Instantly / ConnectQuote (appetite knockouts → traditional) |
| **Connect PWA** | Netlify (`cid-connect`) | Git push → auto deploy |
| **Marketing site** | `commercialinsurance-direct.com` | Manual Netlify deploy from **`CID Website/Netlify/`** (not git-connected) |

### Render env (CID-PDF-API)

| Variable | Purpose |
|----------|---------|
| `COTERIE_API_BASE` | `https://api.coterieinsurance.com` (prod) or sandbox URL |
| `COTERIE_PUBLISHABLE_KEY` | Coterie API auth (server) |
| `COTERIE_AGENCY_EXTERNAL_ID` | Agency UUID on all Coterie bodies |
| `COTERIE_STRIPE_PUBLISHABLE_KEY` | Browser Stripe for Coterie bind — **prod needs `pk_live` from Coterie/David** |
| `COTERIE_DEMO_FINALIZE_ENABLED` | `false` in prod; `true` in sandbox only |

---

## Segments & AKHashes

| Segment | `business_class` | Products (owner) | Non-owner |
|---------|------------------|-------------------|-----------|
| **electrical** | `electric_contracting` | BOP (+ optional GL add-on) | Traditional (ownerOnly) |
| **hvac** | `hvac_contractor` | BOP or GL (pick one) | Traditional (ownerOnly) |
| **plumber** | `plumbing_contractor` | BOP or GL (pick one) | Traditional (ownerOnly) |
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

1. **Campaign prefill** — `em`, `ad`, `ct`, `st`, `zp`, `bn`, `bc`, **`ch`**, **`src`**, `cid`; optional `fn`, `ln`, `ph` when valid. List cleaner emits **`ch` + `src`** with the same channel value; intake persists `traffic_source` / `campaign_id` on submit. **Aug 2026:** invalid **`zp`** / **`em`** omitted from URL; **name optional until bind**; ZIP + email required at quote (see **`outreach-claude-playbook.md`** § ConnectQuote prefill policy).
2. **Core questions** — contact, location, owner?, business type, employees
3. **Smart sections** (after owner + type selected):
   - **Plumber appetite knockouts** — Coterie exclusion questions; any “Yes” → traditional long-form (`index.html`)
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
| **Am I Covered KB (Coterie/Spinnaker)** | **Shipped 2026-07-01** — **63 rows** in **`carrier_knowledge`** via migrations **`009`–`013`**; retrieval in **`connectChatEnrichment.js`** |

---

## Production status (2026-07-07)

| Item | Status |
|------|--------|
| Coterie **prod** quoting (CO) | **Working** on Render (`sandbox: false`) — **electrical**, **fitness**, **hvac**, **plumber** |
| Coterie **prod bind** + Stripe charge | **Live card bind** when **`pk_live_`** on Render (Fitness CO verified); **interim demo bind** when `pk_test_` or **`COTERIE_DEMO_FINALIZE_ENABLED=true`** |
| HVAC + plumber **quote email** | **Verified 2026-07-07** — bindable premium + insured quote email on prod API |
| Plumber **appetite knockouts** | **Shipped** — Coterie exclusion list on intake; fail → traditional rail |
| Coterie carrier **KB** for Connect chat | **Loaded** (appetite, GL limits, BOP property, Gold tier default, ops/FAQ) |
| Connect **branding** | **Shipped** — cropped **`logo-nav.png`**, **`BrandLogo`** component |
| Marketing hero phone mockups | **Updated** — enlarged logo in static PNGs; manual Netlify deploy |
| **Campaign / acquisition** | **Owners-only** on ConnectQuote segments; CO-first until producer licensing expands |

**Waiting on David/Coterie:** issued-policy **webhook** spec + auth, **GET artifacts** doc ingest → R2 → Connect vault, insured comms alignment. Webhook URL (registered): `https://cid-pdf-api.onrender.com/webhooks/coterie`.

---

## Demo URLs (sandbox — CO example)

**Electrical:**  
`https://electricalinsurancedirect.com/connectquote.html?fn=Demo&ln=Insured&em=g%40commercialinsurance-direct.com&ph=3039321700&ad=123+Main+St&ct=Denver&st=CO&zp=80202&bn=Demo+Electric+LLC&sales=150000&payroll=75000&src=coterie-demo&cid=coterie-preview`

**Fitness pilates:**  
`https://fitnessinsurancedirect.com/connectquote.html?fn=Demo&ln=Insured&em=g%40commercialinsurance-direct.com&ph=3039321700&ad=123+Main+St&ct=Denver&st=CO&zp=80202&bn=Demo+Pilates+Studio&bc=pilates_studio&sales=150000&payroll=75000&src=coterie-demo&cid=coterie-preview`

**HVAC (CO owner, BOP):**  
`https://hvacinsurancedirect.com/connectquote.html?fn=Demo&ln=Insured&em=g%40commercialinsurance-direct.com&ph=3039321700&ad=123+Main+St&ct=Denver&st=CO&zp=80202&bn=Demo+HVAC+LLC&bc=hvac_contractor&sales=200000&payroll=80000&src=coterie-demo&cid=coterie-preview`

**Plumber (CO owner, BOP):**  
`https://plumberinsurancedirect.com/connectquote.html?fn=Demo&ln=Insured&em=g%40commercialinsurance-direct.com&ph=3039321700&ad=123+Main+St&ct=Denver&st=CO&zp=80202&bn=Demo+Plumbing+LLC&bc=plumbing_contractor&sales=200000&payroll=80000&src=coterie-demo&cid=coterie-preview`

**Demo account:** `g@commercialinsurance-direct.com`

---

## Verified (sandbox + prod)

- [x] CO electrical bindable quote + premium (sandbox → prod)
- [x] Demo finalize → policy row + Connect
- [x] Stripe token bind path wired; **prod live-card bind** (Fitness CO, 2026-07-01)
- [x] Extended Coterie fields exposed (user-selected, not hidden defaults)
- [x] Annual/monthly plan cards on quote screen
- [x] Fitness registry (3 classes) on API
- [x] HVAC + plumber registry + **prod** bindable quote smoke (CO, 2026-07-07)
- [x] HVAC + plumber **quote email** on prod (2026-07-07)
- [x] Plumber appetite knockout questions on intake (Coterie exclusion list)
- [x] Owner-only gate + non-owner redirect to traditional long-form
- [x] Post-bind welcome email to insured (Connect + PWA + policy summary; single email)
- [x] Branded Connect domain `connect.commercialinsurance-direct.com` + live bind E2E (Jul 2026)
- [x] Coterie webhook doc ingest **wired** (`coterieDocIngestService.js`); prod webhook registration with Coterie ongoing
- [x] Store Coterie `PolicyId` + carrier policy # at bind (`coverage_data`) for webhook correlation
- [ ] Multi-state beyond CO — Coterie producer license per state + add to `COTERIE_PILOT_STATES`
- [ ] Operator ConnectQuote learning cards (spec saved — build when volume warrants)

---

## Repos touched

| Repo | What shipped |
|------|----------------|
| `pdf-backend` | Coterie adapter, registry, intake schema, routes, bind completion, static intake JS |
| `electrical-pdf-backend` | `Netlify/connectquote.html` + index banner; **Netlify Drop** deploy (not git-connected) |
| `fitness-pdf-backend` | `Netlify/connectquote.html` + index banner |
| `beauty-pdf-backend`, `cleaning-pdf-backend`, `pet-pdf-backend` | ConnectQuote shell + **`Netlify/email/archive/2026-08-connect-v1/`** creatives (Aug 2026) |
| `hvac-pdf-backend` | `Netlify/connectquote.html` — owner copy, `/` → ConnectQuote |
| `plumber-pdf-backend` | `Netlify/connectquote.html` — owner copy, `/` → ConnectQuote |
| `cid-connect` | **`BrandLogo`**, policy switcher, **`connect.commercialinsurance-direct.com`**, custom domain docs |
| `CID Website/Netlify` | Nav + hero phone mockups with enlarged logo (manual deploy) |

---

## Partner demo (sandbox, Fitness only)

**Prod:** `COTERIE_DEMO_FINALIZE_ENABLED=false` on live marketing. **Sandbox Render:** demo on, sandbox Coterie keys.

| Asset | URL |
|-------|-----|
| Partner demo page (PWA tile) | `https://cid-pdf-api.onrender.com/connectquote/fitness-demo.html` |
| Setup + script | [`connectquote-partner-demo.md`](./connectquote-partner-demo.md) |

Flow: home-screen tile → quote (owner/employee, BOP+GL on Pilates) → **Complete bind — demo** → welcome email → **connect.commercialinsurance-direct.com**.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-10 | Initial ConnectQuote rail: electrical CO, demo bind, Connect handoff |
| 2026-06-12 | Fitness segment; extended Coterie fields; coverage toggles; plan cards; static asset fix |
| 2026-06-12 | Explicit **CID not MoR** / Stripe-via-Coterie compliance section; future-rail template (Thimble) |
| 2026-06-12 | Nationwide investor positioning; yoga GL rating fields; GL $1M/$2M defaults; PL rationale |
| 2026-07-01 | Coterie **prod** keys on Render; **KB migrations 009–013** (63 rows); **interim demo bind** on prod when Stripe is `pk_test_`; Connect + marketing logo refresh |
| 2026-07-07 | **HVAC + plumber** ConnectQuote nationwide launch (CO prod quotes verified); plumber appetite knockouts; owner-only copy; commits `98791af`, `2fee64b`, `6e4ca14` |
| 2026-07-23 | Branded Connect; live bind E2E; webhook doc ingest service. |
| 2026-07-29 | Marketing launch prep — geography gates documented; Operator learning spec. |
| 2026-07-29 | **Partner demo:** `fitness-demo.html` + sandbox Render guide; prod demo off for marketing. |
| 2026-08-10 | **Instantly outreach pipeline:** list cleaner (`ch`/`src`/`cid`), `displayName`, marketing-ready gate in `connectQuoteLinks.js`. |
| 2026-08-19 | **HVAC + plumber** on Instantly / ConnectQuote marketing rail (same as Electrical); Fitness classes counted as three marketing sub-segments. List-cleaner gate updated. |
| 2026-08-21 | **Seven CO Instantly campaigns live** (electrical, fitness, hvac, plumber, beauty, cleaning, pet). **LocalProspects** pull/clean pipeline; **ZIP prefill fix** (`parseUsZip.js`); intake **email/ZIP validation** + **name at bind** (`connectquote-intake.js` `20260821b`). **GUARD WC** routes stubbed on API (planning). Deploy commit `af497c8`. |
