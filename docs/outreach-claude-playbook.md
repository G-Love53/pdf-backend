# Outreach Claude playbook

> **Audience:** Claude (or any agent) helping with Instantly campaigns, list cleaning, and segment email creatives.  
> **Segment launch (Netlify, API, Gmail, poller):** **`docs/connectquote-segment-deploy.md`** — not this doc.  
> **RSS:** Reliable, Scalable, Sellable — one pattern for all segments.  
> **Verified failure modes:** Aug 2026 Fitness + Electrical builds — see §C below.

---

## Two pipelines (never mix hosting)

| Pipeline | Input | Output | Where code & files live |
|----------|--------|--------|-------------------------|
| **A. List → prefill** | Apollo export, LocalProspects Advanced, manual CSV | Instantly CSV with `connectquote_url`, **`ch` + `src`** = `instantly-{st}-{segment}`, `cid` | **`pdf-backend`** only |
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
| ✅ | **electrical**, **fitness**, **hvac**, **plumber**, **beauty**, **cleaning**, **pet**, **painter** |
| ❌ | **bar**, **roofer** — traditional supplement only (segment home / long-form) |

Fitness Instantly/marketing **count:** three sub-segments once class is chosen (`bc=yoga_studio` | `pilates_studio` | `personal_trainer`) — different policy and price. Same domain.

Source of truth: `src/config/connectQuoteLinks.js` → `CONNECTQUOTE_MARKETING_READY`.  
`clean-apollo-instantly.mjs` **exits with error** if `--segment` is not marketing-ready.

### Preferred sources (in order)

1. **LocalProspects** — primary for service SMB (pet, beauty, cleaning). Statewide via **Campaigns API**; Advanced CSV or `pull-localprospects-instantly.mjs`.
2. **Apollo people search** — commercial/trades when you need verified email + titles.
3. **License board / manual CSV** — `normalize.js --source manual`.

### LocalProspects → Instantly (statewide)

**Env:** `LOCALPROSPECTS_API_KEY` in `pdf-backend/.env` (never commit).

**Pull (API — one campaign per Coterie keyword, merged export):**

```bash
cd ~/GitHub/pdf-backend

# Preview credit plan first (no search spend)
node scripts/pull-localprospects-instantly.mjs \
  --segment beauty --state CO \
  --output data/instantly-beauty-co-ready.csv \
  --preview-only

# Full pull → Instantly CSV
node scripts/pull-localprospects-instantly.mjs \
  --segment beauty --state CO \
  --output ~/Downloads/CID_Beauty_CO_Instantly_READY.csv
```

**Clean an existing Advanced CSV export:**

```bash
node scripts/clean-localprospects-instantly.mjs \
  --file data/lp-beauty-co-advanced.csv \
  --output ~/Downloads/CID_Beauty_CO_Instantly_READY.csv \
  --segment beauty --state CO
```

Segment keywords + Coterie `bc` map: `src/outreach/segmentSearchProfiles.js`. **Google category allowlist** (what rows to keep): `src/outreach/localProspects/googleCategoryAllowlist.js`. Full design: **`docs/localprospects-list-design.md`**.

**List quality rules (encoded in cleaner):**

1. Dedupe on **Google listing ID** (`google_cid` / `place_id`), not email or company name.
2. **Email validation** — drop Sentry/Wix telemetry, Broadly, NVA, etc. (`outreachEmailValidation.js`).
3. **Category allowlist** per Coterie sub-segment — not a blocklist.
4. **Strict state gate** — row address state must match `--state`; no empty-state pass-through.
5. **LP export** — dashboard **`Advanced`** CSV + **`With emails`** filter (`format=advanced&has_email=true`) before clean.

Upload: map **`connectquote_url`** and **`displayName`** to custom variables (`stop_for_company` ON when ≤2 contacts/company; duplicate check OFF on fresh upload).

### ConnectQuote prefill policy (Aug 2026 — `parseUsZip.js` + intake `20260821b`)

**Deployed on CID-PDF-API** (`public/connectquote-intake.js`). Segment Netlify pages load `/static/connectquote-intake.js?v=20260821b` (or newer).

| Field | Prefill when | When missing / bad | Required when |
|-------|----------------|-------------------|---------------|
| **ZIP (`zp`)** | Valid **CO** ZIP (80001–81699) from LP row or **last** 5-digit match in address | **Blank** — never prefill street numbers (e.g. `12245` on `12245 Main St`) | **Quote step** — soft blue “confirm your ZIP” hint, not red on load |
| **Email (`em`)** | Passes `outreachEmailValidation.js` | **Blank** — junk/Sentry/Wix/noreply omitted from URL | **Quote step** |
| **First / last name** | Prefilled when present in list | **Blank OK** | **Bind only** (pay / demo) — do not block quote |
| **`displayName`** | Always in Instantly CSV (cleaner) | Use in **Step 1 body** — not subject | N/A |

**URL builder:** `src/outreach/urlBuilder.js` omits invalid `zp` and `em` from `connectquote_url` (same rules as cleaner).

**ZIP extraction bug (fixed):** LP exports often put the **street number** in the ZIP column. Extractor uses the **last** `\d{5}` in the full address string, validates against `--state`, and falls back to blank when nothing passes.

**Re-clean before upload** if CSV was built before 2026-08-21:

```bash
node scripts/clean-localprospects-instantly.mjs --file data/lp-export.csv ...
# or rebuild connectquote_url from an existing Instantly CSV via urlBuilder (see team notes)
```

### CO list benchmarks (Aug 2026 — LocalProspects)

| Segment | Sendable | Notes |
|---------|----------|--------|
| **Beauty** (hair salon keyword) | **551** | `displayName` 551/551; firstName 337/551; phone in URL ~high; hair-heavy bc mix (522 hair / 16 barber / 9 esthetician / 4 nail) |
| **Cleaning** (home + carpet keywords merged) | **177** | firstName 61/177; phone in URL **81/177 (~45%)** — mobile ops norm; drop junk email + out-of-state only |
| **Pet** | **~226** | phone ~99%; pilot reference |

**LP credits:** charged on enrichment/search, not download; ~$0.0039/credit (Starter). Metro searches spill outside city limits; **listing ID dedupe** on export — cross-city overlap still bills. Do not re-run same CO cleaning pull without new keywords (mostly dupes).

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

**Phone (`ph` in `connectquote_url`):** normalized to **10-digit US NANP** via `src/outreach/normalizeUsPhone.js` — strips `+1` from **11-digit** Apollo values **before** write (never cap at 10 first). Rejects corrupted `1303…` leftovers. Tries **mobile → work direct → corporate → company** — first valid wins. Invalid → **omitted**. Run script **directly on Apollo CSV** — do not open/save in Excel first (Excel can truncate phones). Re-export after script updates before adding `ph` back to Instantly.

**Flags:**
- `--skip-domain-check` — more rows, more bounce risk
- `--one-per-company` or `--max-per-company 1` — strict single contact

**Instantly campaign:** when using 2 contacts per company, enable **`stop_for_company`** (stop on company reply).

### Merge variables and Step 1 copy

Instantly substitutes **`""`** for missing variables — no error.

| Variable | Role |
|----------|------|
| **`connectquote_url`** | Image + CTA links (CSV) — **required** |
| **`displayName`** | Step 1 body — business name (~45 chars max after normalizer); **551/551 beauty**, **177/177 cleaning** |
| `firstName` | **Do not use** when coverage is low (e.g. cleaning **61/177**, beauty **337/551**, electrical ~63%) |

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

- Built by `src/outreach/urlBuilder.js` → `{domain}/connectquote.html?em=&st=&bn=&ch=&src=&cid=&bc=` (+ optional `fn`, `ln`, `ph`, `ad`, `ct`, `zp` when valid)
- **Invalid `zp` / `em` omitted** — intake requires both at quote; see **ConnectQuote prefill policy** above
- **Channel:** set **`ch` and `src`** to the same value (e.g. `instantly-co-electrical`). Intake reads `ch` → `src` → `utm_source`. Safari Link Tracking Protection and some click trackers **strip `src`** (known tracking name); **`ch` and `cid` usually survive** — Ops attribution depends on `ch`/`traffic_source`, not URL `src` alone.
- **Do not** reuse Instantly `ch` for a trade org. Partner Layer = `ch=partner-{id}` + `partner={id}` — mint on `/operator/funnel`. See [`partner-layer.md`](./partner-layer.md).
- **`cid`** = campaign tag (e.g. `electrical-co-2026-08`)

### Claude review checklist (before upload)

- [ ] 100% target state (company address, not person location)
- [ ] No duplicate emails; ≤2 per company if running dual-contact campaigns
- [ ] No role inboxes (`info@`, `hello@`)
- [ ] Segment-appropriate businesses
- [ ] Every row has `connectquote_url` with `ch`, `src`, `cid`
- [ ] No bad CO ZIPs in URL (`zp` blank OK — intake prompts)
- [ ] Step 1 uses `{{displayName}}`, not `{{firstName}}`, when firstName coverage is under ~80%
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

### 1. Editor strips anchor tags on paste — August 2026

**Superseded.** New campaigns follow [§D](#d-instantly-html-21-october-2026-corrected-22-october-example-23-october). Do not click the image and paste a merge variable. The editor still cannot link an image through its UI. On 22 October 2026 a paused campaign kept `href="{{cq_url_s2}}"` through a code-view paste, including the anchor around the image. Verify in code view after every paste. Live links render blue. If the button text is black while unsubscribe is blue, the anchor was stripped.

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

### 6. Custom tracking domain + unsubscribe (per segment — required at deploy)

Shared Instantly unsubscribe domains (e.g. `inreg1.net`) can hit URIBL (+1.7 spam score).

**Every new ConnectQuote segment — add to Netlify deploy checklist:**

| Step | Where | Action |
|------|--------|--------|
| 1 | **Netlify DNS** | CNAME **`inst`** → **`prox.itrackly.com`** (TTL 3600) |
| 2 | **Netlify** → Site configuration → **Environment variables** | Instantly unsubscribe/CTD env — **copy pattern from a live segment** (plumber, pet, etc.) |
| 3 | **Instantly** → Email account → Settings | Custom tracking domain → **`inst.{segment}insurancedirect.com`** → verify CNAME + SSL |
| 4 | Test send | Unsubscribe link uses **`inst.{domain}`**, not shared Instantly domain |

**One CTD per segment domain** — not one shared across segments.

If verification asks for **TXT**, add in Netlify DNS. Propagate 24–72h before launch.

### 7. Scale path and plan limits (future)

**Instantly plan cap** binds before inbox count or list supply. Verify tier before multi-segment launch:

| Plan | Emails / month |
|------|----------------|
| Growth | **5,000** |
| Hypergrowth | **125,000** |

Manual editor paste does not scale (8 segments × many states). **Instantly API V2** `POST /api/v2/campaigns` accepts `sequences` HTML directly and bypasses the paste sanitizer. Build when standing up Beauty/Cleaning/Pet batches.

---

## D. Instantly HTML (21 October 2026, corrected 22 October, example 23 October)

Learned on Colorado Electrical workers’ comp. Beauty on 23 October is the copy-from example: same shell, test email looked right. §C.1’s “click the image and paste the merge variable” step is retired. The 22 October correction is that a merge-variable `href` can survive a paste into a paused campaign.

### Image hosting

Instantly does not host images. The image dialog takes an `https://` URL and rejects anything else. There is no upload.

Creatives live on the segment site:

```text
{segment}-pdf-backend/Netlify/email/archive/<version>/<filename>.jpg
→ https://<segment-domain>/email/archive/<version>/<filename>.jpg
```

The version folder is dated and named for the campaign (`2026-08-connect-v1`, `2026-10-wc-v1`). It holds the JPEG and the HTML fragments that use it. Do not delete a folder a live campaign still references.

Electrical, and the other ConnectQuote segment sites, are Git-connected. Renaming a file in the working folder does nothing until it is pushed. A push publishes the site. Drag-drop is a fallback, and it must be the whole `Netlify` folder. Dropping one file replaces the site.

No spaces or download suffixes in filenames. `CID_Electrical_WC_Creative (1).jpg` and `CID_Electrical_WC_Creative No Click.jpg` both put `%20` in every URL.

Gmail caches remote images by URL through `ci3.googleusercontent.com`. Replacing a file at the same path can keep serving the old image. A new creative gets a new filename (`..._v2.jpg`). Mail already sent keeps the old `src`. After a creative change, send a fresh test. The copy already in an inbox will not update.

Load the new URL in a private window before the test send.

Electrical workers’ comp image (one picture for both steps):

`https://electricalinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Electrical_WC_Creative_v2.jpg`

Fragments: `electrical-pdf-backend/Netlify/email/archive/2026-10-wc-v1/CID_Instantly_Step2_Ready.html` and `CID_Instantly_Step3_Ready.html`.

### Worked example — Beauty, 23 October 2026

Copy these two files for the next segment. They use the electrical line breaks, and the test email matched that campaign.

| Step | HTML | Image |
|------|------|-------|
| 2 | `beauty-pdf-backend/Netlify/email/archive/2026-10-wc-v1/CID_Beauty_Instantly_Step2.html` | `https://beautyinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Beauty_WC_Creative2.jpg` |
| 3 | `.../CID_Beauty_Instantly_Step3.html` | `https://beautyinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Beauty_Certificate_Creative3.jpg` |

`CID_Beauty_WC_Creative3.jpg` does not exist. A mixed name loads nothing. The editor can still show a picture from an earlier preview. The test email shows a blank.

### Next segment

Same shell for every ConnectQuote segment. Workers’ comp sentences only where WC is live: beauty, cleaning, pet, fitness, plumber, electrical. HVAC and painter stay off that line.

1. Copy the two Beauty HTML files into `{segment}-pdf-backend/Netlify/email/archive/2026-10-wc-v1/`.
2. Change the sentences, the alt text, and the image `src`. Leave the line breaks, the paddings, and the three `href`s. Step 2 stays `{{cq_url_s2}}`. Step 3 stays `{{cq_url_s3}}`.
3. The `src` starts with `https://` and is the filename that will be pushed. A host with no `https://` does not load. Beauty step 3 is `CID_Beauty_Certificate_Creative3.jpg`, not a WC name with a 3 on it. Plumber, cleaning, pet, and fitness were published 26–27 October. Their addresses are in [`outreach-creatives.md`](./outreach-creatives.md). HVAC and painter are the segments still without this folder, and they do not get a workers’ comp line.
4. Push that repo. A push publishes. Confirm each JPEG with `curl -I` until it is **200** and the byte size matches the file.
5. Pause the campaign. Open code view, select all, delete until the pane is empty, paste the whole file.
6. Reopen code view. The text, the picture, and the orange button each still have their `href`. Add a link only if one is missing.
7. Click **Edit** on that step, then send the test. The preview can show a picture while the test is still Step 1, which is text only and has no picture.
8. Leave the visual editor alone after the paste. It wraps each row in a `div` and inserts `<br>`, which is the spacing that did not match Electrical.

The unsubscribe line in these files is the electrical one: `https://UNSUBSCRIBE_INSTANTLY.ai`. Leave it.

### A live campaign is read-only

An Active campaign hides the editing toolbar. No `+`, no link icon, no `<>` code view. Clicking the body does not bring them back.

Pause, edit, then Resume. The toggle is at the top right. A paused campaign sends nothing.

### The sanitizer

On 21 October, a `href` that did not start with `http://` or `https://` was stripped to:

```html
<span data-campaign-unlinked-url="...">LINK TEXT</span>
```

On 22 October that did not hold. Pasting a fragment with three `{{cq_url_sN}}` hrefs into a **paused** campaign’s code view kept all three, including the anchor around the image. The image was clickable in the delivered email.

Practical rule: paste the HTML with the merge-variable hrefs already in it, while the campaign is paused, then reopen code view and confirm they are still there. Use the link tool only for a link that did not survive. A query-string-only column (`?{{cq_qs_s2}}`) is not required. Keep the full URL columns on the list.

The editor still cannot link an image through its UI. It will not hold an image selection, and the image dialog only inserts a new image. The image link has to arrive in the pasted markup.

Do not draw a button inside the JPEG. The electrical workers’ comp creative has no button in the picture. The only button is the HTML one. An in-image button can come back only after a real inbox shows the image itself is clickable, and it must match the HTML button.

### Paste

1. Pause the campaign.
2. Open the `.html` in Cursor. Word turns quotes curly. TextEdit shows the page instead of the source.
3. Select all and copy. The copy must start with `<div` or `<table`.
4. In Instantly, open `<>` code view. Click into the code pane, select all, and delete. The pane must be empty. Clearing the visual editor leaves wrapper tags behind.
5. Paste. Exit code view.
6. Reopen code view and confirm the three `href`s are still there (text, picture, orange button). Link with the chain icon only what was stripped. Do not add them again when they survived.
7. Leave the unsubscribe anchor that is already in the file (`https://UNSUBSCRIBE_INSTANTLY.ai`). That is the electrical line, and it is the beauty line.
8. Save. Click **Edit** on that step. Send the test. Resume when the test matches Electrical.

Keep the blank line between row groups that the Beauty files already have. That is the Electrical spacing. Do not add more. Do not remove them to “tighten” the file. The visual editor is what turns gaps into a stack of `<br>`.

A live link renders blue. Button text may need to be set back to white after linking.

The image cell is `padding:0` only. Do not add `font-size:0` or `line-height:0`. `display:block` on the image already closes the gap. `font-size:0` also hides the alt text, so a blocked image collapses to a blank.

Put the padding and the font on the button `<td>`, not the `<a>`:

```html
<td align="center" bgcolor="#ff8c1a" style="background:#ff8c1a;border-radius:7px;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:22px;font-weight:bold;">SEE MY OPTIONS &rarr;</td>
```

If the sanitizer eats the anchor, the cell still looks like a button and only the link is re-applied.

### Test send

The test send is the **⋮** menu at the top right, next to Launch / Pause. It sends the step that is in focus. Click **Edit variant A** on that step first, or the test is Step 1.

### Attribution

`ch` and `src` stay the same value. They are the channel. Only `cid` changes per step.

```text
...&ch=instantly-co-electrical&src=instantly-co-electrical&cid=electrical-co-2026-10-s1
```

`cid` is stored as `campaign_id` inside `submissions.raw_submission_json`. It is not a column. Read it with `raw_submission_json->>'campaign_id'`. `/operator/funnel` By channel rolls up on `ch` / `src` only. Operator Home shows it as the second line of `src / cid`. Fixing the funnel later still sees sends that already landed.

### Campaign settings

| Setting | Value | Why |
|---------|-------|-----|
| Send emails as text-only | OFF | Strips HTML from every step |
| Send first email as text-only | ON | Protects Step 1 only |
| Stop sending on reply | ON | |
| Open tracking | ON | |
| Link tracking | OFF | Routes links through `inreg1.net`, URIBL-listed, about +1.7 spam score |
| Duplicate check on upload | OFF | The list is already deduped. Checking Campaigns skips leads from an earlier campaign |
| Verify leads | ON on the first upload only | Credits are spent only when this is ticked |
| Gap between steps | 3 days | Same on every segment, so a comparison is the copy, not the cadence |
| Subject, steps 2 and 3 | Empty | Threads under Step 1 |

Link tracking off means Instantly shows no clicks. Click data comes from ConnectQuote landings. A zero in Instantly’s click column is expected.

### Throughput

The daily limit caps total sends across all steps, not each step. 1,625 leads × 3 steps is about 4,875 sends. At 50 a day that is about 97 days, whatever the gap between steps is.

The step gap does not change how long the campaign runs. The daily limit and the number of sending inboxes do.

A new inbox needs 2–3 weeks of warmup before it joins a campaign. It shares domain reputation with the inbox already sending. An unwarmed inbox damages the domain.

### List build

Re-uploading leads resets everyone to Step 1 and drops verification results. To add columns without verifying again: export the verified leads from Instantly, merge the new columns onto that export, and re-upload with **Verify leads** unchecked.

Map these as custom variables: the per-step URL columns, `displayName`, `licenseExpiration`. City, ZIP, and county ride inside the URL and do not need their own columns.

Remove government and institutional rows by hand (school districts, municipal airports). They pass the filters and they do not buy this coverage.

Do not rewrite the Instantly license footer until Gerry asks.

---

## Instantly HTML step setup (after paste)

Follow [§D](#d-instantly-html-21-october-2026-corrected-22-october-example-23-october). Copy the Beauty step 2 and step 3 files. Pause first. Paste into an empty code view. The three `href`s are already in the file. Confirm them. Add a link only if one is missing.

Footer license stays as already shipped. The unsubscribe anchor stays the one in the Beauty file.

---

## Segment reference

| Segment | Repo | Domain | ConnectQuote (Instantly) |
|---------|------|--------|--------------------------|
| bar | bar-pdf-backend | barinsurancedirect.com | ❌ traditional |
| roofer | roofing-pdf-backend | roofingcontractorinsurancedirect.com | ❌ traditional |
| plumber | plumber-pdf-backend | plumberinsurancedirect.com | ✅ |
| hvac | hvac-pdf-backend | hvacinsurancedirect.com | ✅ |
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
- Tell Gerry to re-apply every link after a code-view paste. Confirm the three `href`s. Add one only if it is missing.

---

## Connect demo note (post-bind)

Policy Home works after bind; **Am I Covered** scenario buttons need policy PDF indexed. Use process questions (*How do I file a claim?*, *How do I request a COI?*) or a golden demo account with backfilled dec page.

---

## Quick smoke test (after deploy)

```bash
open "https://electricalinsurancedirect.com/email/archive/2026-08-connect-v1/CID_Electrical_Creative.jpg"
open "https://electricalinsurancedirect.com/connectquote.html?fn=Demo&em=demo@example.com&st=CO&ch=instantly-co-electrical&src=instantly-co-electrical&cid=test"
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-10-22 | **Instantly correction.** An Active campaign is read-only: Pause, edit, Resume. A paused code-view paste kept `{{cq_url_sN}}` hrefs, including the image link. New JPEG filename when the picture changes (Gmail caches the URL). No `font-size:0` on the image cell. §D. |
| 2026-10-21 | **Instantly HTML (Electrical WC).** Images stay on the segment site. Link tracking off. Step gap 3 days. Do not re-upload a verified list. §D. The “href always stripped” line was corrected the next day. |
| 2026-08-21 | **7 CO Instantly campaigns live** (electrical, fitness, hvac, plumber, beauty, cleaning, pet). **ZIP prefill fix** (`parseUsZip.js` — last match + CO validation). **Email prefill validation** on intake. **Name optional until bind.** LP pull/clean scripts + list design doc. Beauty JPEG committed (`CID_Beauty_Creative.jpg`). Custom vars: `connectquote_url` + `displayName`. |
| 2026-08-10 | Instantly pipeline: `displayName`, marketing-ready gate, verified paste failure modes. |
