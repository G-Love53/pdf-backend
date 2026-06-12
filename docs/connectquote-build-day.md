# ConnectQuote build day — one page

> **Date:** 2026-06-12 (updated) · **Shipped summary:** [`connectquote-shipped-2026-06.md`](./connectquote-shipped-2026-06.md)  
> **Goal:** End-to-end sandbox demo + production path without waiting on Coterie.  
> **Stripe:** Payment collects **direct to Coterie** (their Stripe Connect / embed) — CID is **not** merchant of record.  
> **Pilot:** Electrical + Fitness · CO · AKHashes in `coterieRegistry.js`.

---

## Demo script (5–7 min — sandbox)

1. Open prefill URL:  
   `https://electricalinsurancedirect.com/connectquote.html?fn=Demo&ln=Insured&em=g%40commercialinsurance-direct.com&ad=123+Main+St&ct=Denver&st=CO&zp=80202&bn=Demo+Electric+LLC&src=demo&cid=build-day`
2. Confirm prefilled fields → **Owner: Yes** → business type → employees → **complete Coterie rating fields** (sales, payroll, limits — all Select… until chosen).
3. See instant quote (premium) → choose **annual or monthly card** → pay via **Coterie Stripe** or **Demo: simulate bind (sandbox)**.
4. Success screen → **Open Connect** (bind token / email prefill).
5. Connect: policy vault, timeline, **Am I Covered**, **Request COI**, docs download.
6. Operator ([`/operator`](https://cid-pdf-api.onrender.com/operator)): submission badge **ConnectQuote**, policy bound today, timeline events.

**Demo account:** `g@commercialinsurance-direct.com` · real inbox for welcome email + Connect login.

---

## Constraints (locked)

| Item | Rule |
|------|------|
| Payment | Coterie Stripe only — use `COTERIE_STRIPE_PUBLISHABLE_KEY` on intake page; no CID Stripe |
| Coterie contact | **Zero** — discover bind/pay/webhook from sandbox responses only |
| Primary intake | ConnectQuote thin form |
| Backup | Existing long Netlify `/submit-quote` link in footer |
| Customer ownership | Welcome email + Connect onboarding; **Connect COI**, not Coterie COI portal |
| Keys (Render) | New sandbox set: Agency `8202035f-…`, Publishable `6abe3fe6-…`, Secret server-only, Stripe `pk_test_…` |

---

## Build slices (today)

### A. CID-PDF-API (`pdf-backend`) — ship to Render first

1. **Commit + deploy** existing Coterie skeleton + today’s work.
2. **Env** — update all `COTERIE_*` on Render (new agency/key; add secret + Stripe pk).
3. **Bindable payload** — extend `buildBindableQuotePayload` + intake form fields: contact first/last, legal name, `numEmployees`, payroll/sales, business age/start date, BPP deductible ($500–$5000), product type (BOP vs GL from owner question).
4. **Payment step** — after successful bindable quote, return Coterie payment instructions from API response; intake page renders Coterie/Stripe UI (client uses **their** `pk_test` only).
5. **`coterieBindCompletion.js`** — on webhook (flexible event parser) OR **demo finalize** endpoint (`POST /api/coterie/demo-finalize` sandbox-only): `createPolicy()`, store quote JSON in `coverage_data`, `bind_source: coterie`, timeline `coterie.policy.bound`, `sendBindConfirmationEmail` + `sendWelcomeEmail` with `CID_APP_URL` + bind token.
6. **Docs ingest** — if webhook/API returns policy PDF URL, fetch → R2 → `documents` (`policy_original`) → link `policy_id`.
7. **Registry v1** — `src/config/coterieAkHash.js` → structured JSON: segment, key, label, akHash, states, defaultProducts.
8. **Operator (minimal)** — rail badge on submission lists; exclude ConnectQuote from “waiting for carrier outreach”; count instant binds in “Policies bound (today)”.

### B. Electrical ConnectQuote page (`electrical-pdf-backend/Netlify`)

1. New **ConnectQuote** section (or `/quote` mode via `?cq=1`): segment branding from Electrical palette.
2. URL prefill (same params as Instantly).
3. Fields: owner? → business class dropdown → 6 Q + extended bind fields.
4. POST **`https://cid-pdf-api.onrender.com/api/coterie/connectquote`** then payment step.
5. Footer: “Need full review? [Complete detailed application]” → existing long form.

### C. CID Connect (`cid-connect`)

1. **Bigger logo** — Header `h-16→h-24`, Login `h-16→h-24` (or `h-28` on md); consider segment subtitle under logo post-bind.
2. **Post-bind onboarding** — after bind token redeem: “Add to Home Screen” card (iOS + Android steps); segment accent from policy segment.
3. **Coterie policies** — ensure bridge lists policies with `bind_source`/coterie metadata; vault + timeline show bound policy same day.
4. **COI / Am I Covered / Docs** — no Coterie UI links; use existing `/api/connect/*` paths once policy + docs exist.

### D. Sandbox demo helpers

1. **`docs/coterie-sandbox-fixtures.md`** — update with successful bindable + payment shape (redacted) once discovered.
2. Optional **`/operator/demo/connectquote`** read-only status page for demo (submission → quote → bound → Connect link).

---

## Coterie-minimal strategy (no back-and-forth)

1. **Morning:** Run bindable with full extended fields until `isSuccess: true`; capture response JSON → code against it.
2. **Payment:** Use fields returned by bindable (client secret, session id, or payment URL) + Coterie Stripe pk — do not invent CID payment API.
3. **Webhook:** Register `https://cid-pdf-api.onrender.com/webhooks/coterie` in Coterie dashboard if self-serve; else **demo finalize** after sandbox payment succeeds (poll or manual “I paid” with `applicationId` correlation).
4. **COI:** Ignore Coterie insured COI for v1; Connect generates ACORD 25 from cid-postgres policy row.

---

## S6-lite (instant bind) — ops meaning

| Traditional S6 | ConnectQuote |
|----------------|--------------|
| BoldSign awaiting signature | **Awaiting payment** (short) |
| Webhook signed | **Webhook / demo-finalize bound** |
| `signed_bind_docs` | Coterie bind receipt + policy PDF |
| Same | `policies` row + Connect invite same day |

---

## Done definition (2026-06-12)

- [x] Render env updated; Coterie code deployed
- [x] CO electrical bindable quote returns premium in sandbox
- [x] Sandbox demo bind → policy row + Connect login works for demo email
- [x] Extended Coterie questions on intake (coverage toggles + rating fields)
- [x] Annual/monthly plan cards on quote screen
- [x] Fitness segment live (3 business classes)
- [ ] Live Stripe pay & bind confirmed with Nicole (demo bind works)
- [ ] Welcome email + PWA hint on success card
- [ ] Operator ConnectQuote pipeline card (full)

---

## Fitness demo URLs (CO sandbox)

| Sub-segment | `bc` param | Owner products | Non-owner |
|-------------|------------|----------------|-----------|
| Yoga studio | `yoga_studio` | GL | GL |
| Pilates / mind-body | `pilates_studio` | BOP + GL | GL |
| Personal trainer | `personal_trainer` | GL | GL |

**Pilates (owner, BOP+GL):**  
`https://fitnessinsurancedirect.com/connectquote.html?fn=Demo&ln=Insured&em=g%40commercialinsurance-direct.com&ad=123+Main+St&ct=Denver&st=CO&zp=80202&bn=Demo+Pilates+Studio&bc=pilates_studio&src=demo&cid=build-day`

**Yoga:** append `&bc=yoga_studio&bn=Demo+Yoga+Studio`  
**Trainer:** append `&bc=personal_trainer&bn=Demo+Fit+Trainer+LLC`

Flow matches electrical: confirm dropdowns → Get quote → Demo simulate bind → Open Connect.

---

## Out of scope today (next sprint)
- FB/IG landing variants (URL-only segment routing)
- Full operator ConnectQuote pipeline card
- Production keys / multi-state registry
- Coterie COI integration

---

**Repos:** `pdf-backend` (API) · `electrical-pdf-backend` (intake) · `cid-connect` (PWA) · docs here.
