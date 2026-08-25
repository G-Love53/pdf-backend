# GUARD WC — post-Jon rollout checklist

> **When to use:** After Jon/GUARD confirms P-env NBQ works (premium + `PolicyNumber`) and prod credentials are issued.  
> **Spec:** [`guard-integration.md`](./guard-integration.md) · **Registry:** `src/config/guardRegistry.js`

---

## Gate (all environments)

- [ ] P-env NBQ returns **`FullTermAmt`** + **`PolicyNumber`** on plumber CO (sandbox smoke)
- [ ] Jon confirms **`RatingClassificationCd`** per class (e.g. `518300` vs `518301`)
- [ ] Prod **ContractNumber** + API keys (not `PAFAKE10`)
- [ ] Prod **`GUARD_API_BASE`** → `https://gigezrate.guard.com/dotnet/api/acordservice/acord.svc`
- [ ] **`GUARD_WEBHOOK_AUTH`** set; doc push URL shared with GUARD (when ready)

---

## Segment appetite (confirm with Jon before flipping `wcEnabled`)

| Tier | Segments | NCCI (registry) | Default | Notes |
|------|----------|-----------------|---------|--------|
| **A — service / low knockout** | beauty, cleaning, pet, fitness | 9586, 9014, 0917, 9063 | **Prefer ON** after NBQ smoke each | Doc appetite; no height/roof knockouts |
| **B — trades (pilot)** | plumber | 5183 | **ON** (v1 test segment) | Commercial/industrial DD note |
| **C — trades (review)** | electrical | 5190 | **Include w/ disclaimer** | One-line 15 ft + light commercial — see appetite notes below |
| **C — trades (hold)** | hvac | 5537 | **Hold** until Jon confirms | Roof / install-heavy ops; hard to pre-screen in email |
| **D — not in registry** | painter, bar, roofer | — | **OFF** | Add class + `wcEnabled` when GUARD confirms code |

**Two switches per segment:**

1. **`guardRegistry.js`** → `wcEnabled: true/false`
2. **`GUARD_ENABLED_SEGMENTS`** on Render (comma list; empty = WC off everywhere)

Both must allow the segment. CO only until **`GUARD_PILOT_STATES`** expands.

---

## Deploy sequence (prod `cid-pdf-api`)

1. **Code:** Set `wcEnabled: true` in `guardRegistry.js` only for Jon-approved segments.
2. **Render env:**
   ```
   GUARD_API_BASE=https://gigezrate.guard.com/dotnet/api/acordservice/acord.svc
   GUARD_API_KEY=…
   GUARD_API_SECRET=…
   GUARD_CONTRACT_NUMBER=…   # prod agency code
   GUARD_SP_NAME=com.commercialinsurance-direct
   GUARD_ENABLED_SEGMENTS=beauty,cleaning,pet,fitness,plumber   # adjust to appetite
   GUARD_PILOT_STATES=CO
   ```
3. **Redeploy** prod (and keep sandbox on P-env for demos).
4. **Smoke per segment:** CO ConnectQuote → demo or live bind → WC panel → NBQ premium.
5. **Operator:** Timeline events `guard.indicated` / `guard.bound` visible on submission.

No segment-repo changes — WC is **`pdf-backend` only** (`connectquote-intake.js` post-bind panel).

---

## Tier C — Electrical vs HVAC (outreach / knockouts)

GUARD **Digital Decision** (instant WC) can still decline/refer after NBQ. Question: can we **explain that in one email line**, or does it need intake knockouts?

| Segment | GUARD note (registry) | Coterie pre-quote knockouts | Email / UX verdict |
|---------|----------------------|----------------------------|-------------------|
| **Electrical** | Work **above 15 ft**; **commercial/industrial** can decline DD | None (solar = separate prohibited class) | **Include** — one disclaimer line fits Instantly + WC panel |
| **HVAC** | Class 5537; doc cites **roof HVAC** risk | None | **Hold** — roof/install is core trade; disclaimer gets long or misleading |
| **Plumber** (ref) | Commercial/industrial DD note | 8 yes/no on BOP intake | Already pilot; WC separate from BOP knockouts |

**Electrical — suggested copy (email Step 1 footnote or post-bind WC lead):**

> BOP/GL instant quote is for owner-operated electrical work. **Workers’ Comp indication** covers typical service & repair — not routine work above **15 feet**, and not heavy commercial/industrial-only shops.

**HVAC — hold until Jon confirms:**

- Is CO **5537** `[E]` for residential/light commercial **install & service**?
- Does **roof-mounted** work or **new construction** auto-refer/decline?
- If yes to roof knockout → keep **`wcEnabled: false`** or add 2–3 intake yes/no (cumbersome) before WC offer.

**Do not** add GUARD knockouts to Instantly body for HVAC without Jon — list is owner-operated SMB; roof work is common on real jobs.

---

## Reference: WC Appetite Supplement (Aug 2026)

Local file: `~/Downloads/WC_Appetite_Supplement.pdf` (WCAS081126, agent/broker marketing — **not in repo**).

Highlights for CID planning:

- **Digital Decision** for most classes, premiums up to **~$50k**
- **150+** new eligible class codes (state/carrier varies)
- **60-Second Appetite Check** in ASC before assuming a class
- Streamlined journey: fewer questions, automated X-mods

**ConnectQuote segment ↔ supplement buckets (marketing alignment — confirm NCCI with Jon):**

| CID segment | GUARD supplement bucket |
|-------------|-------------------------|
| beauty | Beauty Parlors/Barber Shops, Nail Salons |
| cleaning | Janitorial/Commercial Cleaning Services |
| pet | Pet Supplies (retail); our class 0917 is pet sitting — confirm |
| fitness | Fitness Centers |
| plumber | Contractors → Plumbing |
| electrical | Contractors → Electrical Work (NY: some restrictions) |
| hvac | Contractors → HVAC Systems |
| painter | Contractors → Painting & Wall Covering |

Contractors section footnote: restrictions may apply in **New York** (CO pilot unaffected). Final eligibility = underwriting + state law, not this PDF alone.

---

## Sandbox vs prod

| | Sandbox | Prod |
|---|---------|------|
| Service | `cid-pdf-api-sandbox` | `cid-pdf-api` |
| GUARD host | `pgigezrate…` | `gigezrate…` |
| Contract | `PAFAKE10` | Prod agency code |
| IP whitelist | Render Oregon CIDRs (`74.220.48.0/24`, `74.220.56.0/24`) | Not required |
| Demo bind | `COTERIE_DEMO_FINALIZE_ENABLED=true` | `false` |

---

## After rollout

- [ ] Update [`guard-integration.md`](./guard-integration.md) changelog + appetite table
- [ ] CONNECT: second policy card when `bind_source: guard` (phase 4)
- [ ] Doc webhook → R2 ingest (when GUARD enables push)
