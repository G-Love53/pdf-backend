# Outreach Claude playbook

> **Audience:** Claude (or any agent) helping Rick with Instantly campaigns, list cleaning, and segment email creatives.  
> **RSS:** Reliable, Scalable, Sellable — one pattern for all segments.

---

## Two pipelines (never mix hosting)

| Pipeline | Input | Output | Where code & files live |
|----------|--------|--------|-------------------------|
| **A. List → prefill** | Apollo export, LocalProspects Advanced, manual CSV | Instantly CSV with `connectquote_url`, `src=instantly-{st}-{segment}` | **`pdf-backend`** only |
| **B. Creative → email** | Embedded HTML (`CID_Creative_*_Embedded.html`) | JPEG on segment domain + `instantly_step3.html` | **Each `{segment}-pdf-backend/Netlify/email/`** |

**Do not** host campaign JPEGs on Render (`cid-pdf-api`). Instantly must load images from `{segment}insurancedirect.com`.

**Do not** use Zywave — removed from CID; poor email yield.

---

## A. List pipeline

### Preferred sources (in order)

1. **Apollo people search** (by segment + state) — best email yield for B2B outreach.
2. **LocalProspects** — discovery, phones, websites; weak on yoga/wellness emails; better on trades.
3. **License board / manual CSV** — `normalize.js --source manual`.

LocalProspects is **not** the primary email source for Instantly. Use `has_email=true` or Instantly export to see sendable rows before paying for enrichment.

### Cleaning rules (Apollo → Instantly)

Run **`pdf-backend/scripts/clean-apollo-instantly.mjs`** (do not hand-roll unless fixing edge cases):

```bash
cd ~/GitHub/pdf-backend

node scripts/clean-apollo-instantly.mjs \
  --file "/path/to/apollo-export.csv" \
  --output "/path/to/{segment}-{st}-instantly-clean.csv" \
  --state CO \
  --segment electrical \
  --campaign electrical-co-2026-08
```

**Strict mode (default):** CO company address only, fitness/trade allowlist, one contact per company, email domain matches website, verified emails, decision-maker titles.

**Relaxed:** add `--skip-domain-check` (more rows, more bounce risk).

**Electrical / trades:** extend allowlist in script if segment ≠ fitness (today’s script is fitness-tuned; add segment-specific filters or a `--segment` allowlist block when cleaning non-fitness lists).

### Output columns (Instantly)

`Email`, `First Name`, `Last Name`, `Title`, `Company Name`, `Phone`, `Website`, `City`, `State`, `Zip`, `Personalization`, **`connectquote_url`**, `business_class`, `segment`, `campaign_tag`, `src`

### Prefill URL rules

- Built by `src/outreach/urlBuilder.js` → `{domain}/connectquote.html?fn=&em=&st=&bn=&src=&cid=&bc=`
- **`src` must be** `instantly-{state}-{segment}` (e.g. `instantly-co-electrical`) — **not** `apollo`. Ops Home attributes binds to channel.
- **`cid`** = campaign tag (e.g. `electrical-co-2026-08`).

### Claude review checklist (before upload)

- [ ] 100% target state (company address, not person location)
- [ ] No duplicate companies or emails
- [ ] No role inboxes (`info@`, `hello@`)
- [ ] Segment-appropriate businesses (no chiro/dental in fitness/electrical lists)
- [ ] Every row has `connectquote_url` and `business_class` when Coterie dropdown applies
- [ ] Recommend ZeroBounce/MillionVerifier before first large send on warmed domain

---

## B. Creative pipeline

### Folder layout (every segment repo)

```text
Netlify/email/
  README.md
  archive/YYYY-MM-slug/
    CID_{Segment}_Creative.jpg
    instantly_step3.html
    source_embedded.html   (optional)
```

See **`docs/outreach-creatives.md`** for registry of active versions.

### Add or refresh a creative

```bash
cd ~/GitHub/pdf-backend

# One segment (embedded HTML from Downloads/design)
node scripts/bootstrap-segment-email.mjs \
  --segment electrical \
  --embedded ~/Downloads/CID_Creative_Electrical_Embedded.html \
  --version 2026-08-connect-v2

# Regenerate HTML only (after template change)
node scripts/generate-instantly-email.mjs --segment electrical --version 2026-08-connect-v2

# Extract JPG only
node scripts/extract-creative-jpg.mjs \
  --input ~/Downloads/CID_Creative_Electrical_Embedded.html \
  --output ~/GitHub/electrical-pdf-backend/Netlify/email/archive/2026-08-connect-v2/CID_Electrical_Creative.jpg
```

Then: **commit segment repo → Netlify deploy → smoke URL in browser.**

### Instantly Step 3 setup (once per campaign variant)

1. Open `archive/{version}/instantly_step3.html` from segment repo — copy all.
2. Instantly → Step 3 → `<>` HTML mode → paste.
3. **`{{connectquote_url}}`** is already on image + CTA — do not hardcode domains.
4. Replace `[LICENSE NUMBER]` once.
5. Footer: Instantly **+ → Insert Unsubscribe Link** (replace placeholder line).
6. Campaign custom variable: **`connectquote_url`** ← CSV column.

**Do not** use Instantly built-in prefill — CSV prefill is richer and matches Ops attribution.

### New version vs overwrite

- **New Instantly creative test** → new folder `archive/2026-09-speed-v2/` + new JPEG filename or slug.
- **Never delete** old archive folders referenced by live steps.
- Update segment `Netlify/email/README.md` + `docs/outreach-creatives.md` when active version changes.

---

## Segment reference

| Segment key | Repo | Domain |
|-------------|------|--------|
| bar | bar-pdf-backend | barinsurancedirect.com |
| roofer | roofing-pdf-backend | roofingcontractorinsurancedirect.com |
| plumber | plumber-pdf-backend | plumberinsurancedirect.com |
| hvac | hvac-pdf-backend | hvacinsurancedirect.com |
| fitness | fitness-pdf-backend | fitnessinsurancedirect.com |
| electrical | electrical-pdf-backend | electricalinsurancedirect.com |
| beauty | beauty-pdf-backend | beautyinsurancedirect.com |
| cleaning | cleaning-pdf-backend | cleaninginsurancedirect.com |
| pet | pet-pdf-backend | petserviceinsurancedirect.com |

Config source of truth: `marketing/segmentEmailConfig.js` (keep in sync with `src/config/connectQuoteLinks.js`).

---

## What Claude should NOT do

- Commit `.env`, API keys, or raw Apollo exports with PII to public repos without Rick asking.
- Deploy Connect to Render (Connect is Vite SPA elsewhere).
- Put outreach list tooling in segment repos (keep in `pdf-backend`).
- Suggest Zywave integration (removed).
- Break legacy Fitness URL: `https://fitnessinsurancedirect.com/email/CID_Fitness_Creative.jpg`.

---

## Connect demo note (post-bind)

Policy Home works after bind; **Am I Covered** scenario buttons need policy PDF indexed. For live demos use process questions (*How do I file a claim?*, *How do I request a COI?*) or a golden demo account with backfilled dec page. See partner demo doc.

---

## Quick smoke test (after deploy)

```bash
# Creative loads
open "https://electricalinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Electrical_Creative.jpg"

# Prefill (sample)
open "https://electricalinsurancedirect.com/connectquote.html?fn=Demo&ln=Test&em=demo@example.com&st=CO&src=instantly-co-electrical&cid=test"
```
