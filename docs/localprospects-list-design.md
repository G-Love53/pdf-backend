# LocalProspects list design

Lessons from manual Colorado pulls (Aug 2026) and how the automated pipeline encodes them.

## Four quality rules (implemented)

| Rule | Why | Where |
|------|-----|--------|
| **Dedupe on Google listing ID** (`place_id` / `google_cid`) | Same business, different spellings across overlapping metro radii (109 dupes in one CO exercise) | `cleanLocalProspectsRows.js` — primary key `g:{listing_id}`; email dedupe is secondary |
| **Email validation before storage** | 53/462 rows were Sentry/Wix telemetry, Broadly review vendor, NVA corporate legal — regex-valid, not contacts | `outreachEmailValidation.js` |
| **Category allowlist per Coterie sub-segment** | Blocklists never end (reptile store, child care, waste, rescue kept slipping through) | `localProspects/googleCategoryAllowlist.js` |
| **Strict state gate on address** | Kerrville TX, Yonkers NY, Los Angeles CA on CO queries; city field `Burlingame, CA` on CO pulls | `cleanLocalProspectsRows.js` — empty or wrong state → skip |

## Fifth rule — ZIP extraction (Aug 2026)

| Rule | Why | Where |
|------|-----|--------|
| **Last 5-digit match + state validation** | LP often puts **street number** in ZIP column (`14120` on `14120 Candlewood Ct`) — wrong ZIP is worse than blank for Coterie rating territory | `src/outreach/parseUsZip.js` → `localProspectsAdapter.js`, `urlBuilder.js`, intake prefill |

**Behavior:**

- Prefer explicit ZIP column when it passes **CO** range (80001–81699).
- Else take **last** `\d{5}` from full address line (not first — street numbers match first).
- If column ZIP fails but address ends with valid CO ZIP, use address.
- If nothing valid → **`zip: null`** — omit `zp` from `connectquote_url`; intake **requires** ZIP at quote with soft hint.

**Do not drop** rows solely for missing ZIP if email + city + business name are present — client fills ZIP on form.

**Do drop:** junk email, wrong-state listing, duplicate listing/email (existing rules).

## ConnectQuote prefill (intake — deployed 2026-08-21)

Shared intake: `/static/connectquote-intake.js` (Render). See **`outreach-claude-playbook.md`** § ConnectQuote prefill policy.

| Field | Quote step | Bind step |
|-------|------------|-----------|
| ZIP | Required | — |
| Email | Required | — |
| First / last name | Optional | Required |

## Coterie bc ↔ Google categories

Coterie dropdown values do **not** match Google taxonomy. Example: Google has **"pet groomer"**; Coterie has **`pet_grooming`**. **"Mobile grooming"** may not exist as a Google category.

**Source of truth:** `src/outreach/localProspects/googleCategoryAllowlist.js`

- Add categories from production export review, not from search keywords alone.
- `categoryToBc.js` is a thin resolver — no regex blocklist.
- If Google category is missing on the row, keyword `bc` from the LP campaign is used only when category is blank (export gap), not to override a non-matching category.

## Statewide coverage model

Google caps results per search. **One statewide query is not enough.**

LocalProspects **Campaigns API** automates iteration:

- `scope.include`: state region `location_code` (e.g. Colorado)
- `default_depth`: per-city result cap inside the region
- **One campaign per keyword** (API is single-keyword; merge on export)

This is equivalent to automating the manual “13 metro pulls per segment” — overlapping radii still happen; **listing ID dedupe** is what makes merges safe.

### City list vs radius grid

| Approach | Pros | Cons |
|----------|------|------|
| **LP region + default_depth** (current) | No custom geo maintenance; LP walks cities | Less control over Pueblo vs Pueblo West gaps |
| **Explicit city list per state** | Deterministic coverage for known gaps | Must maintain `STATE_CITY_LISTS` per expansion state |
| **Radius grid** | Even geographic sampling | Heavy overlap; needs strong dedupe; more API volume |

**Decision (Aug 2026):** Start with **LP region campaigns + listing dedupe**. Add explicit CO city supplements only where production pulls show gaps (Pueblo West, Aurora-via-Denver, etc.).

Keyword → bc search profiles live in `segmentSearchProfiles.js` (what to pull). Category allowlist (what to keep) lives separately in `googleCategoryAllowlist.js`.

### LP credit economics (observed Aug 2026)

- Credits charged on **search/enrichment**, not CSV download.
- Starter plan ≈ **$0.0039/credit** ($39 / 10k).
- **Metro spillover:** city-named searches return mostly neighboring cities (e.g. Cherry Hills Village → Denver/Englewood).
- **Cross-city duplicate billing:** same `google_cid` in multiple city searches still consumes credits; export dedupes listings to one row.
- **`has_email=true`** on campaign export API may not reduce row count — always run **`outreachEmailValidation.js`** in clean step.
- Approximate yield: beauty ~5.5 credits/sendable; cleaning ~9.6 credits/sendable.

## Scripts

```bash
# API pull (requires LOCALPROSPECTS_API_KEY in pdf-backend/.env — never commit)
node scripts/pull-localprospects-instantly.mjs \
  --segment beauty --state CO \
  --output ~/Downloads/CID_Beauty_CO_Instantly_READY.csv

# Conservative caps (cleaning-style dual keyword)
node scripts/pull-localprospects-instantly.mjs \
  --segment cleaning --state CO \
  --max-leads 800 --default-depth 50 \
  --output ~/Downloads/CID_Cleaning_CO_Instantly_READY.csv

# Clean existing Advanced export
node scripts/clean-localprospects-instantly.mjs \
  --file data/lp-beauty-co-advanced.csv \
  --segment beauty --state CO \
  --output ~/Downloads/CID_Beauty_CO_Instantly_READY.csv
```

## Instantly upload

Map custom variables:

| CSV column | Instantly variable |
|------------|-------------------|
| `connectquote_url` | **`connectquote_url`** |
| `displayName` | **`displayName`** |

**Campaign settings:** `stop_for_company` ON (when ≤2 contacts/company); duplicate check OFF on fresh list upload.

**LP export (dashboard dropdowns):** always **`format=advanced`** + **`With emails`** filter before clean. API client defaults: `src/outreach/localProspects/client.js`.

## CO production pulls (Aug 2026)

| Segment | Sendable | firstName | Phone in URL | ZIP in URL |
|---------|----------|-----------|--------------|------------|
| Beauty (hair) | 551 | 337 | high | 427 good / 124 blank / 0 bad |
| Cleaning (merged) | 177 | 61 | 81 (~45%) | 146 good / 31 blank / 0 bad |
| Pet | ~226 | — | ~99% | — |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-21 | ZIP rule (`parseUsZip.js`); prefill policy; CO benchmarks; Instantly `displayName`; credit economics; out-of-state city skip. |
| 2026-08-18 | Initial four rules + statewide campaign model. |
