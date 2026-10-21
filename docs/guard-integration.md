# CID × GUARD — Workers’ Comp (ConnectQuote second rail)

> **Canonical location (RSS):** `pdf-backend/docs/guard-integration.md`  
> **As of:** 2026-10-19 (America/Denver). **Status: live on the customer URL for six Colorado trades.** Prod `cid-pdf-api` `GUARD_ENABLED_SEGMENTS` is `beauty,cleaning,pet,fitness,plumber,electrical`. Do not clear it. Jon’s green light was 16 October 2026. Prod base is `gigezrate`. SP name is `com.commercialinsurance-direct`. Sandbox stays `pgigezrate` and `PAFAKE10`. Do not copy the sandbox key, secret, or `PAFAKE10` onto prod. `GUARD_CAPITA_PAY_URL` stays unset. GUARD emails pay info. Do not put the bare `https://policyholder.guard.com/payment` link on the customer confirmation. PDF ingest is commit `25b97d0`. Next carrier or next state: [`agent-start.md`](./agent-start.md) New carrier lane.  
> **Registry on:** beauty, cleaning, pet, fitness, plumber, electrical (CO). **Off:** HVAC `5537`. Painter, bar, and roofer are not in the registry.  
> **Packet:** local `Downloads/GUARD WC API Documentation - 08.21.26` (not in repo).  
> **Appetite supplement (Aug 2026):** local `Downloads/WC_Appetite_Supplement.pdf` — doc **WCAS081126**; marketing overview + eligible class buckets (not API truth; confirm NCCI + `[E]` with Jon / 60-Second Appetite Check in ASC).
> **Related:** [`coterie-integration.md`](./coterie-integration.md) · [`CID_ARCHITECTURE.md`](./CID_ARCHITECTURE.md) · [`Deploy_Guide.md`](./Deploy_Guide.md) · [`AUDIT_READINESS.md`](./AUDIT_READINESS.md) · [`partnerships.md`](./partnerships.md) · [`VENDORS_S1_S6_CONNECT.md`](./VENDORS_S1_S6_CONNECT.md) · [`CID_IP_AND_ACQUIRER_PROTECTION.md`](./CID_IP_AND_ACQUIRER_PROTECTION.md) § multi-carrier roadmap

**Purpose:** GUARD (W.R. Berkley / WestGUARD) is **Workers’ Comp on the same CID journey as Coterie BOP/GL** — not a replacement, and **not always second**. v1 upsells WC after Coterie. **Phase 2-ish:** we may market **WC standalone**, test, then offer BOP/GL (reverse). CID owns intake + CONNECT; GUARD owns WC rating, bind, and **direct bill**. CID is **not** merchant of record.

---

## RSS (decision filter)

| Pillar | GUARD WC |
|--------|----------|
| **Reliable** | SOAP ACORD on CID-PDF-API only; credentials on Render; timeline + `PolicyNumber` correlation; docs webhook → R2; indication (NBQ) labeled as indication until NBS Accept |
| **Scalable** | One adapter, three doors. **WC is a per-segment (and state) on/off** — launching a ConnectQuote trade does **not** auto-enable WC. GUARD’s auto-quote program they call **Digital Decision**; we never use that name in CID UX |
| **Sellable** | Sub-$5k SMB indication then questions. Either order: BOP first or **WC-first test**. CID never takes the WC payment |

---

## Product (locked for v1; don’t hard-wire order)

**Coterie BOP/GL stays live.** GUARD WC is optional on the same `submission_public_id`. **v1 order:** Coterie first, then WC. **Build so the reverse works** — do not require a Coterie policy to call GUARD.

| Door | When | Phase |
|------|------|-------|
| **B — WC after Coterie** | Post-bind confirmation: “Workers’ Comp as well?” | **v1 first UI** |
| **Connect vault opt-in** | Later, if segment + state apply | After B |
| **A — Intake checkbox** | “Workers’ Comp indication too?” on main form (entity, years, owner-on-WC); NBQ after commercial quote | **Shipped (2026-08-27)** |
| **WC-first (standalone)** | Market WC as its own product → bind GUARD → then offer BOP/GL (Coterie) on confirmation / CONNECT | **Phase 2-ish / test** |

User may bind Coterie, GUARD, both, or neither — **either product can be first.**

Build implication: WC adapter + `guard.session` must work on a submission with **no** `coterie.session`. After WC bind, the same confirmation/CONNECT pattern can show “Need BOP/GL too?” (reverse of door B). Same clickwrap, same WC switch.

### WC switch (required)

**Not every ConnectQuote segment is WC-eligible.** Coterie on ≠ GUARD on.

GUARD’s instant/auto-UW path is what **they** call **Digital Decision**. Internally we map that to class flag `[E]` plus our switch. **Customers and CONNECT never see “Digital Decision.”** We say Workers’ Comp — or we show nothing if the switch is off.

| Layer | What it does |
|-------|----------------|
| **`GUARD_ENABLED_SEGMENTS`** (env) | Comma allowlist. Unset = every registry `wcEnabled` line. Empty string = WC off. A listed segment still needs `wcEnabled: true`. |
| **`guardRegistry.js`** (code) | Per-segment `wcEnabled: true/false` + NCCI class. New segment launch defaults **off** until Rick/appetite says on |
| **State gate** | `GUARD_PILOT_STATES` (CO first) — same pattern as Coterie |
| **Runtime hide** | Confirmation CTA + CONNECT opt-in **do not render** if switch is off, class `[I]`, or no employees / owner excluded |

If the switch is off: Coterie BOP/GL unchanged; no WC questions, no GUARD call.

**Pilot appetite (registry Aug 2026):** Beauty (hair / barber / nails), Cleaning, Pet, Fitness (yoga / pilates / personal trainer) + Plumber + Electrical **on** in sandbox (`wcEnabled: true`). HVAC **off** (roof/install knockouts). Painter / bar / roofer not in registry until Jon confirms class codes.

---

## GUARD API (packet 08.19.26)

SOAP / ACORD P&C 1.30. Escaped XML inside SOAP `Service/data`. Not REST/JSON.

| Txn | Use | Bindable? |
|-----|-----|-----------|
| **NBQ** | Premium **indication**. UW questions not required. FEIN not required. | **No** — `NotQuotedNotBound`. Premium may change or decline after questions |
| **NBS** | Full submit. Questions required. Auto-UW if class `[E]`. | **Yes** only if status is exactly `QuotedNotBound` **and** UW is not Refer/Reject (`isGuardInstantBindable`) |
| **BND** | Bind by `PolicyNumber` only | After QuotedNotBound |
| **SBR** | Refer to underwriting | Ops path — not instant |
| **Questions inquiry** | `UnderwritingQuestionsInqRq` by state + class | Before NBS |

**Auth:** `CustLoginId` / `Pswd` (API key + secret preferred) + `ContractNumber` (agency code). P/test: **IP whitelist** + log into ASC and accept T&Cs. Prod: no IP whitelist.

**Endpoints:** P `https://pgigezrate.guard.com/dotnet/api/acordservice/acord.svc` · Prod `https://gigezrate.guard.com/dotnet/api/acordservice/acord.svc`

**Class flags (their Digital Decision engine):** `[E]` auto-quote · `[R]` refer · `[I]` ineligible. CO is NCCI. Our segment switch is **in addition to** this — `[E]` still does not show WC if `wcEnabled` is false.

**Duplicate check:** name + zip + FEIN. Updates must send returned `PolicyNumber`.

**Gotcha:** mailing address must not equal location address (sandbox to prove workaround).

---

## Indication vs bind questions (SMB / sub-$5k)

Prefill from ConnectQuote: name, business, address, email, employees, payroll, segment / business class.

| Step | Extra from insured | Notes |
|------|-------------------|--------|
| **Indication (NBQ)** | **~2–4 fields** | Legal entity, owner on/off WC, maybe years-in-business / FT–PT. **No FEIN. No UW list.** |
| **If they like it (NBS)** | **~12–15 questions** + FEIN | ~10 policy-level + 2–5 class Y/Ns. Then pick GUARD pay plan |
| **Bind (BND)** | Confirm | API is policy number only |

An indication is not the ready-to-bind note. That note starts only after NBS, when the quote is instant-bindable and still unbound. Flow: [`CID_ARCHITECTURE.md`](./CID_ARCHITECTURE.md).

Policy-level knockouts (examples): temp/leased labor **Yes = Decline**; PEO / volunteer / hazmat / aircraft / transport 5+ = Refer; subcontract >10% = Refer.

---

## Signatures (planning)

**Digital Decision / API bind:** GUARD **BND has no signature field.** Attestation in the packet is the fraud **“I Agree”** question on NBS — not BoldSign, not a drawn name. Same idea as Coterie (card bind, no S6 e-sign).

**Prefer clickwrap** — same feel as ConnectQuote / segment application (checkbox + typed name + timestamp in timeline). Mobile Safari/Chrome and CONNECT. **Do not** add a finger-drawn signature unless **GUARD** says their paper or a state requires a formal e-sign.

| If GUARD says… | Do this |
|----------------|---------|
| API BND + I Agree is enough | Clickwrap on the WC bind step (matches ConnectQuote). |
| They require a signed application PDF | Reuse **BoldSign** (SMS/email link). Do not add a second e-sign vendor. |
| Risk is Refer (not Digital Decision) | No instant bind — their portal / ops, not a phone canvas. |

**CONNECT later opt-in:** same clickwrap. Never put GUARD credentials in the app.

**Open with GUARD (not an internal guess):** confirm Digital Decision BND needs no applicant wet/e-sign beyond I Agree / our clickwrap.

---

## Billing (CID out of payments)

GUARD **company direct bill (CPB)** or agency bill. Pay plans are **theirs** (one-pay, down + installments, some direct-draft / payroll). **No CID Stripe. No CID ACH file. No card on our page.**

Confirm with **GUARD**: after BND, insured pays **only through GUARD** (invoice / their portal / ACH on their file).

Paper carriers in worksheet: WestGUARD, NorGUARD, AmGUARD, EastGUARD (`PAWEST10` / `PANORG10` / etc.).

---

## Data model

One ConnectQuote `submissions` row. Two optional `quotes` / `policies` rows.

```text
submission_public_id
  ├── Coterie  BOP|GL   bind_source=coterie
  └── GUARD    WC       bind_source=guard
```

- Idempotent WC APIs keyed by `submission_public_id` (+ GUARD `PolicyNumber` once issued). Submission may be **WC-only** (no Coterie row) or Coterie-first.
- Timeline: `guard.session`, `guard.indicated`, `guard.quoted`, `guard.referred`, `guard.rejected`, `guard.bound`.
- CONNECT: second policy card; fill `workers_comp_limit` from EL limits. Browser = anon only — quote/bind stays on CID-PDF-API.
- Docs: `POST /webhooks/guard-docs` stores the carrier PDF (commit `25b97d0`). Same rules as New carrier lane step 3. Live: `https://cid-pdf-api.onrender.com/webhooks/guard-docs`. Sandbox: `https://cid-pdf-api-sandbox.onrender.com/webhooks/guard-docs`. The earlier sandbox file `SUWC781711` was discarded before this code and will not appear unless GUARD posts it again.
- **COI:** WC certificates are **GUARD-issued**, requested from Connect Instant COI. Do not fall back to CID ACORD 25. The cert adapter is still not built. Spec: [`connect-coi-carrier.md`](./connect-coi-carrier.md).

Offer WC only if employees exist **or** owner elects inclusion (owner-only Coterie + 0 employees + owner excluded = nothing to rate).

---

## Code map (pdf-backend only)

| Path | Role |
|------|------|
| `src/config/guardRegistry.js` | Per-segment **`wcEnabled`**. On: plumber `518322`, electrical `519000`, fitness `9063`, beauty `9586`, cleaning `9014`, pet `0917`. Off: HVAC `5537`. |
| `src/services/guardService.js` | SOAP client, XML escape, NBQ / NBS / BND / questions |
| `src/services/guardIntakeService.js` | Prefill from submission; indication vs bindable; clickwrap on bind |
| `src/routes/guardRoutes.js` | `/api/guard/wc/config` · `/indicate` · `/questions` · `/quote` · `/bind` · `/refer` (SBR) |
| `src/routes/webhooks.js` | `POST /webhooks/guard-docs` — auth, then R2 + documents (`25b97d0`) |
| `public/connectquote-intake.js` | Post-bind WC panel (shown when config `offerWc`) |
| cid-connect | Vault WC opt-in later; no carrier secrets |

**Do not** put GUARD code in segment repos.

---

## Render env (CID-PDF-API only — never commit)

| Variable | Purpose |
|----------|---------|
| `GUARD_API_BASE` | P or prod SOAP URL |
| `GUARD_API_KEY` / `GUARD_API_SECRET` | Signon credentials |
| `GUARD_SP_NAME` | Reverse domain (e.g. `com.commercialinsurance-direct`) |
| `GUARD_CONTRACT_NUMBER` | Agency code |
| `GUARD_WEBHOOK_AUTH` | `Authorization` value GUARD sends on doc push |
| `GUARD_ENABLED_SEGMENTS` | Comma allowlist. Unset allows every registry-on line. Empty string turns WC off. Independent of Coterie segments. Prod list: `beauty,cleaning,pet,fitness,plumber,electrical` |
| `GUARD_PILOT_STATES` | `CO` until expansion |

---

## Phased plan

| Phase | Done when | Status |
|-------|-----------|--------|
| **0 Review** | Packet reviewed; Option B + hybrid doors; this doc | Done |
| **1 Sandbox indication** | NBQ premium in P for one `[E]` class (no UI) | Done |
| **2 Door B UI** | Post-bind WC indication on confirmation page | Done |
| **3 NBS + BND** | Bindable quote + GUARD bill; own `policies` row `bind_source: guard` | Live on prod for the six CO trades (`5d88d50`) |
| **4 CONNECT** | Own WC policy row + carrier PDF. Later vault opt-in stays later | Policy row and PDF ingest live (`25b97d0`) |
| **5 Door A — intake WC intent** | Main-form opt-in before commercial quote | Done (2026-08-27) |
| **6 WC-first (phase 2-ish)** | Standalone WC landing/test; after GUARD bind, offer Coterie BOP/GL. Same adapter; no Coterie prerequisite | Planned |

**Capture → Submit → Render → Deliver → Operate:** Either rail can Capture first. Same public_id. Render = Coterie REST and/or GUARD SOAP + doc webhook. Operate = CONNECT.

### CONNECT (multi-policy UX)

| Surface | Behavior |
|---------|----------|
| **Policy dropdown** | Header switcher — `Segment · Line — Business · Carrier` (e.g. BOP vs Workers' Comp · GUARD). |
| **Am I Covered?** | Uses **selected** policy context; switch policy first. |
| **File a claim** | GUARD WC → routed to GUARD messaging; claim still stored in Connect. |
| **Skipped WC at bind** | Policy Home **Add Workers' Comp** card → segment ConnectQuote. |

**Policy row:** `finalizeGuardBind()` writes the GUARD policy number, `bind_source: guard`, `policy_type: WC` (`5d88d50`). Am I Covered for GUARD uses the coverage summary saved at bind. The document indexer picks up declarations and policy PDFs. Claude, then Gemini. No Perplexity.

---

## Sandbox access (P env — already open)

Sandbox and prod both have GUARD credentials. Do not copy the sandbox key, secret, or `PAFAKE10` onto prod. Do not clear prod `GUARD_ENABLED_SEGMENTS`. The steps below are how P was opened. Gerry sends any new partner email.

1. **Sandbox Render env** (`cid-pdf-api-sandbox`): base `https://pgigezrate.guard.com/dotnet/api/acordservice/acord.svc`, SP name `com.commercialinsurance-direct`, contract `PAFAKE10`, `GUARD_PILOT_STATES=CO`. Do not put dummy keys in git. Fake values look configured and will 401.
2. **IP whitelist** (Jon, 14 October 2026): live and test use the same Render ranges, `74.220.48.0/24` and `74.220.56.0/24`.  
3. **Gerry sends partner email.** Do not email Jon or the API box unless Gerry asks for a draft and then sends it himself. Prod credentials are already live. Do not copy sandbox onto prod.  
4. **Portal:** log into GUARD Agency Service Center **P** with those creds and **accept T&Cs** — required before the webservice works.  
5. Paste key / secret / contract number into Render (sandbox). Redeploy.  
6. Smoke: `GET /api/guard/wc/config?segment=plumber` → `offerWc: true`. Then a Plumber ConnectQuote bind → WC indication.

**Partner test (WC-only, sandbox):** `https://cid-pdf-api-sandbox.onrender.com/partner-test/guard-wc.html` — segment picker, class codes, NBQ→bind without other products. Enabled when `GUARD_PARTNER_TEST_ENABLED` is unset on P-env (defaults on sandbox) or `true`. Optional `GUARD_PARTNER_TEST_TOKEN` + `?token=` on URL.

**Prod rollout (multi-segment):** [`guard-wc-rollout.md`](./guard-wc-rollout.md)

Webhook auth (`GUARD_WEBHOOK_AUTH`) is set on prod and sandbox. Do not write the value into git. PDF ingest is live (`25b97d0`).

## Open with GUARD / Rick

**GUARD (API / paper):**

- [x] P-env signed off. Prod key, secret, and contract number are on `cid-pdf-api` (green light 16 October 2026). Do not copy sandbox or `PAFAKE10`
- [x] Agency code + API keys on Render. Username and password are the Agency Service Center portal only, not env vars
- [x] GUARD direct-bills. CID does not collect the card. `GUARD_CAPITA_PAY_URL` stays unset
- [ ] Confirm Digital Decision bind: **I Agree / clickwrap enough**, or they require a signed PDF
- [ ] Class+suffix encoding (table 4-digit vs samples 6-digit)
- [ ] Location ≠ mailing workaround

**Rick (appointment / appetite):**

- [ ] v1 segment WC switch (contractor knockouts vs service trades)
- [ ] DPA / appointment row in [`partnerships.md`](./partnerships.md)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-10-21 | Unbound NBS quote (instant-bindable, not bound) is a line on the ready-to-bind note. NBQ is not. |
| 2026-08-20 | Planning spec from 08.19.26 packet + ConnectQuote Coterie pattern. Option B first; CID not MoR. |
| 2026-08-20 | Per-segment WC on/off (code + env). GUARD “Digital Decision” = their auto-quote name; not used in CID UX. |
| 2026-08-20 | Signatures: prefer ConnectQuote-style clickwrap; **GUARD** confirms if e-sign is required. |
| 2026-08-20 | Phase 2-ish: WC may be marketed **standalone**, then offer BOP/GL. Adapter must not require Coterie first. |
| 2026-08-20 | **Build start:** Plumber WC on; Electrical off. SOAP adapter + post-bind indication UI. Live quote needs GUARD P keys + IP whitelist. |
| 2026-08-21 | Routes mounted on Render (`guardRoutes.js`); intake post-bind WC box wired; env still empty — no live GUARD calls. |
| 2026-08-26 | `finalizeGuardBind()` → `policies` row; `wcEnabled` for appetite segments; sandbox P-env smoke (plumber CO). |
| 2026-09-04 | Partner test lane: `/partner-test/guard-wc.html` + `/api/guard/wc/registry` + `/api/guard/wc/partner/start` (WC-only, sandbox). |
| 2026-10-06 | Prod still `offerWc: false`. Base, segment list, CO, SP name, and webhook auth are set. Key, secret, and contract number wait on GUARD. Capita URL stays absent. |
| 2026-10-08 | Jon: early-week check-in (week of 13 October) before live credentials. Quick pay is `https://policyholder.guard.com/payment`. Insured types ZIP and policy number `XXWC123456`. Do not set `GUARD_CAPITA_PAY_URL` yet. |
| 2026-10-14 | Jon: links and webhook by Friday 16 October. Check-in done. Live mail and credentials: `info@commercialinsurance-direct.com`. |
| 2026-10-16 | Jon’s green light to submit business on the live API. Prod base `gigezrate`. SP name `com.commercialinsurance-direct`. |
| 2026-10-19 | Colorado WC live for the six trades. Own policy row `5d88d50`. PDF ingest `25b97d0`. Next 10 states approved, pilot lists stay CO. |
