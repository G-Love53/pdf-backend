# CID × GUARD — Workers’ Comp (ConnectQuote second rail)

> **Canonical location (RSS):** `pdf-backend/docs/guard-integration.md`  
> **As of:** 2026-08-21 (America/Denver). **Status: route stubs + intake UI on CID-PDF-API** (`af497c8`) — P-env credentials + IP whitelist still required before a live indication.  
> **v1 segment:** **Plumber** (`wcEnabled: true`, NCCI 5183). Electrical is coded **off** (15 ft / commercial Digital Decision knockouts).  
> **Packet:** local `Downloads/GUARD WC API Documentation - 08.19.26` (not in repo).  
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
| **A — Intake checkbox** | Intent on ConnectQuote; no full NBS on the BOP form | Later |
| **WC-first (standalone)** | Market WC as its own product → bind GUARD → then offer BOP/GL (Coterie) on confirmation / CONNECT | **Phase 2-ish / test** |

User may bind Coterie, GUARD, both, or neither — **either product can be first.**

Build implication: WC adapter + `guard.session` must work on a submission with **no** `coterie.session`. After WC bind, the same confirmation/CONNECT pattern can show “Need BOP/GL too?” (reverse of door B). Same clickwrap, same WC switch.

### WC switch (required)

**Not every ConnectQuote segment is WC-eligible.** Coterie on ≠ GUARD on.

GUARD’s instant/auto-UW path is what **they** call **Digital Decision**. Internally we map that to class flag `[E]` plus our switch. **Customers and CONNECT never see “Digital Decision.”** We say Workers’ Comp — or we show nothing if the switch is off.

| Layer | What it does |
|-------|----------------|
| **`GUARD_ENABLED_SEGMENTS`** (env) | Kill switch for a whole deploy (empty = WC off everywhere) |
| **`guardRegistry.js`** (code) | Per-segment `wcEnabled: true/false` + NCCI class. New segment launch defaults **off** until Rick/appetite says on |
| **State gate** | `GUARD_PILOT_STATES` (CO first) — same pattern as Coterie |
| **Runtime hide** | Confirmation CTA + CONNECT opt-in **do not render** if switch is off, class `[I]`, or no employees / owner excluded |

If the switch is off: Coterie BOP/GL unchanged; no WC questions, no GUARD call.

**Pilot appetite (Rick to confirm):** prefer Beauty / Cleaning / Pet / Fitness. Electrical / Plumber / HVAC stay **off** until Digital Decision knockouts (height, commercial, roof HVAC) are acceptable.

---

## GUARD API (packet 08.19.26)

SOAP / ACORD P&C 1.30. Escaped XML inside SOAP `Service/data`. Not REST/JSON.

| Txn | Use | Bindable? |
|-----|-----|-----------|
| **NBQ** | Premium **indication**. UW questions not required. FEIN not required. | **No** — `NotQuotedNotBound`. Premium may change or decline after questions |
| **NBS** | Full submit. Questions required. Auto-UW if class `[E]`. | **Yes** if `QuotedNotBound` + `Accept` |
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
- Docs: GUARD push webhook → R2 → vault (mirror Coterie ingest).

Offer WC only if employees exist **or** owner elects inclusion (owner-only Coterie + 0 employees + owner excluded = nothing to rate).

---

## Code map (when we build — pdf-backend only)

| Path | Role |
|------|------|
| `src/config/guardRegistry.js` | Per-segment **`wcEnabled`** (Plumber on; Electrical off), NCCI class, pilot states |
| `src/services/guardService.js` | SOAP client, XML escape, NBQ / NBS / BND / questions |
| `src/services/guardIntakeService.js` | Prefill from submission; indication vs bindable; clickwrap on bind |
| `src/routes/guardRoutes.js` | `/api/guard/wc/config` · `/indicate` · `/questions` · `/quote` · `/bind` |
| `src/routes/webhooks.js` | `POST /webhooks/guard-docs` (ack) |
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
| `GUARD_ENABLED_SEGMENTS` | Comma allowlist — **WC off** if unset/empty. Independent of Coterie segments |
| `GUARD_PILOT_STATES` | `CO` until expansion |

---

## Phased plan

| Phase | Done when |
|-------|-----------|
| **0 Review** | Packet reviewed; Option B + hybrid doors; this doc |
| **1 Sandbox indication** | NBQ premium in P for one `[E]` class (no UI) |
| **2 Door B UI** | Post-bind WC indication on confirmation page |
| **3 NBS + BND** | Bindable quote + GUARD bill; `createPolicy()` `bind_source: guard` |
| **4 CONNECT** | Second policy + WC limit + later vault opt-in (either line) |
| **5 Optional door A** | Intake `wc_intent` checkbox only |
| **6 WC-first (phase 2-ish)** | Standalone WC landing/test; after GUARD bind, offer Coterie BOP/GL. Same adapter; no Coterie prerequisite |

**Capture → Submit → Render → Deliver → Operate:** Either rail can Capture first. Same public_id. Render = Coterie REST and/or GUARD SOAP + doc webhook. Operate = CONNECT.

---

## Sandbox access (P env — keys come from GUARD)

GUARD does **not** put API keys in the packet. Their sequence (Arianna, Jul 2026): whitelist **our IPs** on P, then they issue credentials.

1. **Render env names** (CID-PDF-API **sandbox** first: `cid-pdf-api-sandbox`) — leave secrets blank until GUARD sends them. Safe to set now:  
   `GUARD_API_BASE=https://pgigezrate.guard.com/dotnet/api/acordservice/acord.svc`  
   `GUARD_SP_NAME=com.commercialinsurance-direct`  
   `GUARD_ENABLED_SEGMENTS=plumber`  
   `GUARD_PILOT_STATES=CO`  
   Do **not** put dummy `GUARD_API_KEY` / `SECRET` / `CONTRACT_NUMBER` — fake values look “configured” and will 401.
2. **IPs to send GUARD** (P whitelist only; prod does not whitelist):  
   - Render **static outbound IPs** on `cid-pdf-api-sandbox` (Settings → Outbound / static IPs — paid on Render; otherwise the IP changes on restart).  
   - Optional: Gerry’s office/home public IP for a laptop SOAP test.  
3. **Email** Arianna.Ronci@guard.com, Jon.Baker@guard.com, john.masur@guard.com, API@guard.com — ask to whitelist those IPs and issue **P API key + secret + agency ContractNumber**.  
4. **Portal:** log into GUARD Agency Service Center **P** with those creds and **accept T&Cs** — required before the webservice works.  
5. Paste key / secret / contract number into Render (sandbox). Redeploy.  
6. Smoke: `GET /api/guard/wc/config?segment=plumber` → `offerWc: true`. Then a Plumber ConnectQuote bind → WC indication.

Webhook auth (`GUARD_WEBHOOK_AUTH`) is **ours** to invent later and give GUARD for doc push — not needed for the first indication.

## Open with GUARD / Rick

**GUARD (API / paper):**

- [ ] P-env Render outbound IPs whitelisted; ASC T&Cs accepted
- [ ] Agency code + API keys on Render
- [ ] Confirm BND → GUARD-only billing (no CID payment)
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
| 2026-08-20 | Planning spec from 08.19.26 packet + ConnectQuote Coterie pattern. Option B first; CID not MoR. |
| 2026-08-20 | Per-segment WC on/off (code + env). GUARD “Digital Decision” = their auto-quote name; not used in CID UX. |
| 2026-08-20 | Signatures: prefer ConnectQuote-style clickwrap; **GUARD** confirms if e-sign is required. |
| 2026-08-20 | Phase 2-ish: WC may be marketed **standalone**, then offer BOP/GL. Adapter must not require Coterie first. |
| 2026-08-20 | **Build start:** Plumber WC on; Electrical off. SOAP adapter + post-bind indication UI. Live quote needs GUARD P keys + IP whitelist. |
| 2026-08-21 | Routes mounted on Render (`guardRoutes.js`); intake post-bind WC box wired; env still empty — no live GUARD calls. |
