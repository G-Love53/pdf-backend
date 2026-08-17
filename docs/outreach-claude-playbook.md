# Outreach Claude playbook

> **Audience:** Claude (or any agent) helping with Instantly campaigns, list cleaning, and segment email creatives.  
> **RSS:** Reliable, Scalable, Sellable — one pattern for all segments.  
> **Verified failure modes:** Aug 2026 Fitness + Electrical builds — see §C below.

---

## Two pipelines (never mix hosting)

| Pipeline | Input | Output | Where code & files live |
|----------|--------|--------|-------------------------|
| **A. List → prefill** | Apollo export, LocalProspects Advanced, manual CSV | Instantly CSV with `connectquote_url`, `src=instantly-{st}-{segment}` | **`pdf-backend`** only |
| **B. Creative → email** | Embedded HTML (`CID_Creative_*_Embedded.html`) | JPEG on segment domain + `instantly_html_step.html` | **Each `{segment}-pdf-backend/Netlify/email/`** |

**Do not** host campaign JPEGs on Render (`cid-pdf-api`). Instantly must load images from `{segment}insurancedirect.com`.

**Do not** use Zywave — removed from CID; poor email yield.

**Never ship base64 in email HTML.** Gmail strips `data:image` URIs. `extract-creative-jpg.mjs` must produce a hosted `https://` URL.

---

## A. List pipeline

### ConnectQuote-ready segments (Instantly)

Only these segments have **live `connectquote.html` on Netlify** and a **bindable CO rail** — safe for `connectquote_url` in CSV and Step 1 copy:

| Ready | Segment |
|-------|---------|
| ✅ | **electrical**, **fitness**, **beauty**, **cleaning**, **pet** |
| ❌ | **hvac**, **plumber** — intake shell / API in progress; **do not** run Instantly ConnectQuote campaigns |
| ❌ | **bar**, **roofer** — traditional supplement only (segment home / long-form) |

Source of truth: `src/config/connectQuoteLinks.js` → `CONNECTQUOTE_MARKETING_READY`.  
`clean-apollo-instantly.mjs` **exits with error** if `--segment` is not marketing-ready.

### Preferred sources (in order)

1. **Apollo people search** (by segment + state) — best email yield for B2B outreach.
2. **LocalProspects** — discovery, phones, websites; weak on yoga/wellness emails; better on trades.
3. **License board / manual CSV** — `normalize.js --source manual`.

LocalProspects is **not** the primary email source for Instantly. Use `has_email=true` or Instantly export to see sendable rows before paying for enrichment.

### Cleaning rules (Apollo → Instantly)

Run **`pdf-backend/scripts/clean-apollo-instantly.mjs`**:

```bash
cd ~/GitHub/pdf-backend

node scripts/clean-apollo-instantly.mjs \
  --file "/path/to/apollo-export.csv" \
  --output "/path/to/{segment}-{st}-instantly-clean.csv" \
  --state CO \
  --segment electrical \
  --campaign electrical-co-2026-08
```

**Default:** CO company address, segment allowlist (fitness-tuned today — extend for trades), **up to 2 contacts per company** (owner + ops/office manager when available), verified emails, decision-maker titles, email domain matches website.

**Flags:**
- `--skip-domain-check` — more rows, more bounce risk
- `--one-per-company` or `--max-per-company 1` — strict single contact

**Instantly campaign:** when using 2 contacts per company, enable **`stop_for_company`** (stop on company reply).

### Merge variables and Step 1 copy

Instantly substitutes **`""`** for missing variables — no error.

| Variable missing | Effect |
|------------------|--------|
| `connectquote_url` | `href=""` → dead links (common in preview without lead selected) |
| `firstName` | Subject/body degrades: `"Hey ,"` |
| `displayName` | Offer line reads without business name (~1% blank after normalizer) |

**~37% of Electrical rows had no first name.** Do not depend on `{{firstName}}`. Use **`{{displayName}}` in body only** (never subject). Canonical copy lives in **`marketing/segmentEmailConfig.js`** → `step1Copy`; print with `node scripts/print-step1-copy.mjs --segment electrical`.

**Step 1 is text only** — typed into Instantly subject + body editor. Not in CSV, not in HTML step. Structure: hook → friction → offer → CTA (link to `{{connectquote_url}}`) → proof → signature.

### displayName normalizer

Raw `Company Name` can hit 124 chars (SEO-stuffed Google Business names). Cleaner emits **`displayName`** via `marketing/normalizeDisplayName.js`:

- Strip pipe segments (`|`), location suffixes (` - Colorado Springs`), parentheticals, legal suffixes (Inc/LLC)
- If still **>45 chars**, emit `''` — blank beats a broken sentence
- Electrical CO benchmark: 436 rows → 432 clean, median 17 chars

### Output columns (Instantly)

`Email`, `First Name`, `Last Name`, `Title`, `Company Name`, **`displayName`**, `Phone`, `Website`, `City`, `State`, `Zip`, `Personalization`, **`connectquote_url`**, `business_class`, `segment`, `campaign_tag`, `src`

### Prefill URL rules

- Built by `src/outreach/urlBuilder.js` → `{domain}/connectquote.html?fn=&em=&st=&bn=&ch=&src=&cid=&bc=`
- **Channel:** set **`ch` and `src`** to the same value (e.g. `instantly-co-electrical`). Intake reads `ch` → `src` → `utm_source`. Safari Link Tracking Protection and some click trackers **strip `src`** (known tracking name); **`ch` and `cid` usually survive** — Ops attribution depends on `ch`/`traffic_source`, not URL `src` alone.
- **`cid`** = campaign tag (e.g. `electrical-co-2026-08`)

### Claude review checklist (before upload)

- [ ] 100% target state (company address, not person location)
- [ ] No duplicate emails; ≤2 per company if running dual-contact campaigns
- [ ] No role inboxes (`info@`, `hello@`)
- [ ] Segment-appropriate businesses
- [ ] Every row has `connectquote_url`
- [ ] ZeroBounce/MillionVerifier before large send on warmed domain

---

## B. Creative pipeline

### Campaign shape (active pattern)

**Text Step 1** → **HTML Step 2** (not “Step 3”). Files are named **`instantly_html_step.html`** to match.

### Folder layout (every segment repo)

```text
Netlify/email/
  README.md
  archive/YYYY-MM-slug/
    CID_{Segment}_Creative.jpg
    instantly_html_step.html      ← paste into Instantly HTML step
    source_embedded.html          (optional)
  CID_*_Creative.jpg              ← Fitness legacy only; do not break
  instantly_fitness_step3.html    ← Fitness legacy only
```

See **`docs/outreach-creatives.md`** for registry and JPEG spec.

### JPEG spec (required)

| Property | Value |
|----------|--------|
| Width | **1200 px** (2× for 600px email container) |
| Format | **JPEG, quality ~82, progressive** |
| Target size | **250–400 KB** |
| Height | Free (2:1 and 3:2 both OK) |

Reference: Fitness 1200×1800 / ~296 KB. Electrical 1200×2400 / ~347 KB.  
Source below 1200px wide upscales soft — request 1200px+ from design.

### Add or refresh a creative

```bash
cd ~/GitHub/pdf-backend

node scripts/bootstrap-segment-email.mjs \
  --segment electrical \
  --embedded ~/Downloads/CID_Creative_Electrical_Embedded.html \
  --version 2026-08-connect-v2

node scripts/generate-instantly-email.mjs --segment electrical --version 2026-08-connect-v2
```

Then: **commit segment repo → Netlify deploy → smoke JPEG URL in browser.**

Template includes **intro line + segment friction line** (spam score / word balance). Friction copy lives in `marketing/segmentEmailConfig.js`.

---

## C. Verified Instantly failure modes (Aug 2026)

### 1. Editor strips anchor tags on paste — ALWAYS re-apply

**#1 silent failure.** Pasting `instantly_html_step.html` into `<>` mode **always strips** `<a href="{{connectquote_url}}">` from the image and CTA (observed on every Fitness + Electrical build). The email looks fine; links are dead. **Always assume stripped; verify before save.**

**Required after every paste:**
1. Click image → link icon → paste `{{connectquote_url}}`
2. Highlight `START MY QUOTE →` → link icon → paste `{{connectquote_url}}`

**Visual check:** live links render **blue** in the editor. If the CTA is black while unsubscribe is blue, anchors were stripped.

The table-wrapped orange button may flatten to plain text on paste — **acceptable**; the creative JPEG includes a button. Do not fight with more HTML.

### 2. Missing merge variables → empty strings

Preview without **Load data for lead** selected → dead links even when HTML is correct. Not a file bug.

### 3. Mandatory pre-send verification

1. **Preview → select a real lead** → hover image and CTA. Must show full URL with `fn=…&em=…&src=…`, not raw `{{connectquote_url}}` or empty.
2. **Send live test to Gmail** → click through → ConnectQuote prefill loads. Unsubscribe will not work in preview-only tests — ignore.

### 4. Campaign settings that strip HTML

**Options → Delivery Optimization:**

| Setting | Required |
|---------|----------|
| Send emails as text-only (no HTML) | **OFF** |
| Send first email as text-only | **ON** (Step 1 only) |

Note: workspace **Advanced Deliverability → always send first email as text-only** overrides campaign settings.

**Also per campaign:**
- `stop_for_company` — **ON** when ≤2 contacts per company
- Duplicate check — **OFF** when loading a fresh list into an existing campaign; **ON** when adding net-new leads only

### 5. Body text is required

Measured Fitness spam score **2.6** / 5.0. Short HTML + linked image adds ~+1.0 fixable with friction line in template (already in generated HTML). Keep 2–3 lines of real copy above the image.

### 6. Custom tracking domain (per segment)

Shared Instantly unsubscribe domains (e.g. `inreg1.net`) can hit URIBL (+1.7 spam score).

Per sending domain:
1. DNS: CNAME `inst` → `prox.itrackly.com`
2. Instantly → Email Account → Custom tracking domain → `inst.{segment}insurancedirect.com`
3. Verify after 24–72h; confirm unsubscribe moved off shared domain in test send

**One CTD per segment domain** — not one shared across segments.

### 7. Scale path and plan limits (future)

**Instantly plan cap** binds before inbox count or list supply. Verify tier before multi-segment launch:

| Plan | Emails / month |
|------|----------------|
| Growth | **5,000** |
| Hypergrowth | **125,000** |

Manual editor paste does not scale (8 segments × many states). **Instantly API V2** `POST /api/v2/campaigns` accepts `sequences` HTML directly and bypasses the paste sanitizer. Build when standing up Beauty/Cleaning/Pet batches.

---

## Instantly HTML step setup (after paste)

1. Open `archive/{version}/instantly_html_step.html` from segment repo — copy all.
2. Instantly → **HTML step** (Step 2 in text→HTML pattern) → `<>` mode → paste.
3. **Re-apply both links** (§C.1) — do not skip.
4. Footer license is pre-filled (**#6784587**); insert unsubscribe via editor.
5. Campaign custom variable: **`connectquote_url`** ← CSV column.

**Do not** use Instantly built-in prefill — CSV prefill is richer and matches Ops attribution.

---

## Segment reference

| Segment | Repo | Domain | ConnectQuote (Instantly) |
|---------|------|--------|--------------------------|
| bar | bar-pdf-backend | barinsurancedirect.com | ❌ traditional |
| roofer | roofing-pdf-backend | roofingcontractorinsurancedirect.com | ❌ traditional |
| plumber | plumber-pdf-backend | plumberinsurancedirect.com | ❌ not yet |
| hvac | hvac-pdf-backend | hvacinsurancedirect.com | ❌ not yet |
| fitness | fitness-pdf-backend | fitnessinsurancedirect.com | ✅ |
| electrical | electrical-pdf-backend | electricalinsurancedirect.com | ✅ |
| beauty | beauty-pdf-backend | beautyinsurancedirect.com | ✅ |
| cleaning | cleaning-pdf-backend | cleaninginsurancedirect.com | ✅ |
| pet | pet-pdf-backend | petserviceinsurancedirect.com | ✅ |

Config: `marketing/segmentEmailConfig.js`

---

## What Claude should NOT do

- Commit `.env`, API keys, or raw Apollo exports without Rick asking.
- Deploy Connect to Render.
- Put list tooling in segment repos.
- Suggest Zywave.
- Break legacy Fitness URL: `https://fitnessinsurancedirect.com/email/CID_Fitness_Creative.jpg`.
- Tell Rick links are pre-wired after Instantly paste without re-apply step.

---

## Connect demo note (post-bind)

Policy Home works after bind; **Am I Covered** scenario buttons need policy PDF indexed. Use process questions (*How do I file a claim?*, *How do I request a COI?*) or a golden demo account with backfilled dec page.

---

## Quick smoke test (after deploy)

```bash
open "https://electricalinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Electrical_Creative.jpg"
open "https://electricalinsurancedirect.com/connectquote.html?fn=Demo&em=demo@example.com&st=CO&ch=instantly-co-electrical&src=instantly-co-electrical&cid=test"
```
