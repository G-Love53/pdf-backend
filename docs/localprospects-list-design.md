# LocalProspects list design

Lessons from manual Colorado pulls (Aug 2026) and how the automated pipeline encodes them.

## Four quality rules (implemented)

| Rule | Why | Where |
|------|-----|--------|
| **Dedupe on Google listing ID** (`place_id` / `google_cid`) | Same business, different spellings across overlapping metro radii (109 dupes in one CO exercise) | `cleanLocalProspectsRows.js` — primary key `g:{listing_id}`; email dedupe is secondary |
| **Email validation before storage** | 53/462 rows were Sentry/Wix telemetry, Broadly review vendor, NVA corporate legal — regex-valid, not contacts | `outreachEmailValidation.js` |
| **Category allowlist per Coterie sub-segment** | Blocklists never end (reptile store, child care, waste, rescue kept slipping through) | `localProspects/googleCategoryAllowlist.js` |
| **Strict state gate on address** | Kerrville TX, Yonkers NY, Los Angeles CA on CO queries | `cleanLocalProspectsRows.js` — empty or wrong state → skip |

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

## Scripts

```bash
# API pull (requires LOCALPROSPECTS_API_KEY)
node scripts/pull-localprospects-instantly.mjs \
  --segment beauty --state CO \
  --output ~/Downloads/CID_Beauty_CO_Instantly_READY.csv

# Clean existing Advanced export
node scripts/clean-localprospects-instantly.mjs \
  --file data/lp-beauty-co-advanced.csv \
  --segment beauty --state CO \
  --output ~/Downloads/CID_Beauty_CO_Instantly_READY.csv
```

Instantly upload: map **only** `connectquote_url` to a custom variable.

**LP export (dashboard dropdowns):** always **`format=advanced`** + **`has_email=true`** (With emails) on campaign download. Manual exports from LP UI must match both before running the clean script.
