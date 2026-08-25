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
| **C — trades (hold)** | electrical, hvac | 5190, 5537 | **OFF** until appetite | Height, commercial, roof HVAC knockouts |
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
