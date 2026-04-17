# CID — Deploy Guide (Render)

> **Canonical location (RSS):** **`pdf-backend/docs/Deploy_Guide.md`** — versioned with **CID-PDF-API** (`main`), pushed to GitHub, reviewed with pipeline changes. **Reliable:** one source of truth for the team. **Scalable:** no duplicate drift across machines. **Sellable:** audit-ready process in the repo.
>
> Optional: keep a **local** copy under `~/GitHub/CID-docs/` for quick reading — sync manually from this file when it changes.
>
> Index: [DOCUMENTATION.md](../DOCUMENTATION.md).

**Purpose:** One way to deploy segment backends. No tribal knowledge; no manual SSH. Reproducible and documentable for audit.

---

## Deployment Model (Locked)

- `CID-PDF-API` (`pdf-backend`) is the single operational backend for operator + S4/S5/S6 + poller.
- Segment backends are intake wrappers and must not duplicate operator/poller/bind pipeline code.

---

## Segment backend (Bar, Roofer, Plumber, HVAC, …)

### Build and run

- **Platform:** Render (Web Service).
- **Build:** Docker. Dockerfile in repo root.
- **Start:** `npm start` → `node src/server.js`.
- **Port:** App listens on `process.env.PORT` (Render sets this; Dockerfile may EXPOSE 10000 for local parity).

### Dockerfile (summary)

- Base: `node:20-bullseye`.
- Installs Chrome (Puppeteer) and deps.
- `WORKDIR /app`; copy `package*.json` → `npm ci` / `npm install`.
- **CID_HomeBase:** Render does not run submodule fetch by default; Dockerfile clones CID_HomeBase into `./CID_HomeBase` during build so templates exist at runtime.
- `CMD ["npm", "start"]`.

### Environment variables (Render dashboard)

Set in Render → Service → Environment. **No secrets in repo.**

| Variable | Purpose | Example (Bar) |
|----------|---------|----------------|
| `PORT` | Set by Render | — |
| `SEGMENT` | Segment id (bar, roofer, plumber, hvac) | bar |
| `GMAIL_USER` | Sender email | quote@… |
| `GMAIL_APP_PASSWORD` | App password | *** |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Gmail API | *** |
| `GOOGLE_PRIVATE_KEY` | Gmail API (or secret file) | *** |
| `CARRIER_EMAIL` or `CARRIER_EMAIL_BAR` | Default recipient | *** |
| `UW_EMAIL_BAR` | Underwriter (segment-specific) | *** |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | AI (if used) | *** |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Leg 3 / DB (if used) | *** |
| `CORS_ORIGINS` | Optional restrict origins | * or comma list |

Use **Secret Files** in Render for private keys if you prefer file-based config.

### Reproducibility

- Same repo + same Dockerfile + same env (values redacted) = same deploy.
- New segment = new Render service, same Dockerfile, new repo clone; only env and repo URL change.
- No manual steps after “Connect repo → set env → Deploy.”

### Phase 1-3 deployment notes (Bar baseline)

- **Phase 1 (intake + outreach baseline)**
  - `/submit-quote` writes CID records and sends packet intake email.
  - Subject includes `submission_public_id` when DB insert succeeds.
- **Phase 2 (operator + notifications)**
  - Operator home dashboard route: `/operator`.
  - Bar notifications to `quote@barinsurancedirect.com` with standardized prefixes:
    - `[CID][Submission]`
    - `[CID][Carrier][Quote]`
    - `[CID][Client][Packet]`
    - `[CID][Bind]`
- **Phase 3 (polish + intake controls)**
  - S4 viewer has fallback “Open in new tab / Download” link.
  - Netlify form has light validation (email/phone/ZIP).
  - Duplicate intake handling supports user choice:
    - detect duplicate
    - optionally force resubmit with `submission_intent` (`corrected`/`new`)
  - Client-submission snapshot PDF:
    - generated at intake from HTML template
    - stored in R2 and `documents` as `application_original`
    - attached in intake packet email.

---

## Bar (`pdf-backend`) — Netlify form → operator → Bind (S1–S6)

**Locked baseline:** 2026-03-19 — Bar segment path reviewed end-to-end (non-RSS operational items called out below).

### Flow (canonical)

1. **Netlify (static site)** — Publish directory typically `Netlify/` (see repo `Netlify/index.html`, `thankyou.html`). The form uses `fetch()` to **`POST /submit-quote`** on the Render API (e.g. `https://cid-pdf-api.onrender.com/submit-quote`), **not** a Netlify Function. After success, browser navigates to `thankyou.html`.
2. **Render API (`src/server.js`)** — `POST /submit-quote`: optional duplicate detection → `recordSubmission()` (Postgres via `DATABASE_URL`) → renders PDF bundle from **`CID_HomeBase/templates`** per `config/bundles.json` (`BAR_INTAKE`) and `config/forms.json` → emails carrier packet (Gmail) with `[CID-BAR-YYYYMMDD-XXXXXX]` in subject when DB write succeeds → optional **client submission snapshot** PDF to R2 + `documents.application_original`.
3. **Gmail poller (`src/jobs/gmailPoller.js`)** — Ingests carrier replies; attaches quote PDFs to R2; creates `quotes` + `work_queue_items` (S4).
4. **S4 / S5 / S6** — Operator UI under **`/operator`** (see `src/routes/operatorRoutes.js`). Extraction review, packet builder, bind initiation use APIs in `extractionReview.js`, `packetBuilder.js`, `bindFlow.js`.
5. **Bind & e-sign (Bar)** — **BoldSign** is the active provider for new binds (`src/services/boldsignService.js`). `bind_requests.hellosign_request_id` stores the **BoldSign document id** (column name is legacy). Completion: **BoldSign webhooks** `POST /api/webhooks/boldsign` and/or **redirect finalize** on `/operator` (`processBoldSignDocumentCompleted` / `tryFinalizeBoldSignFromDocumentId`). **HelloSign/Dropbox Sign** webhook `POST /api/webhooks/hellosign` remains for legacy requests that still use that id in `hellosign_request_id`.
6. **After signature** — Signed PDF → R2 + `documents`; **`createPolicy()`** → `policies` row; submission/quote status cascade; **bind confirmation + welcome emails** (with attachments); Bar agent notification. **Operator metrics:** `/operator` and **`/operator/today/*`** drill-downs use **UTC calendar day** (Render `CURRENT_DATE`).

### Environment (Bar — in addition to tables above)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | **Postgres** connection string (Render Postgres, Supabase Postgres, or other). Required for intake, operator, bind. |
| `SEGMENT` | Default segment (e.g. `bar`). |
| R2 (`R2_*` / project-specific) | Object storage for PDFs; see `src/services/r2Service.js`. |
| BoldSign | `BOLD_SIGN_API_KEY` or aliases noted in `src/services/boldsignService.js`; webhook URL registered to `https://<api>/api/webhooks/boldsign`. |
| `CARRIER_EMAIL` / `UW_EMAIL_BAR` | Routing for intake and notifications. |
| Optional | `ENABLE_FOLLOWUP_SCHEDULER`, `CID_BRAND_NAME`, etc. — see segment backend `src/constants/README.md`. |

### Post-deploy checks (Bar)

- [ ] Netlify live: submit form → Network shows **`POST`** to **Render** `/submit-quote` (200), not only navigation to `thankyou.html`.
- [ ] Email: carrier packet includes **`submission_public_id`** in subject when DB succeeded.
- [ ] Email subject format includes bracketed CID tag for poller matching (example): **`[CID-BAR-YYYYMMDD-######] GL Quote Request - <Applicant>`**.
- [ ] Render logs: no errors on `/submit-quote` or template resolution (`CID_HomeBase` present in Docker image).
- [ ] Bind: BoldSign webhook or redirect finalize creates **`policies`** row; logs may show `[policyService] policy row ready`.
- [ ] S5 sales letter renders through fallback chain (Claude -> Gemini -> deterministic template if needed).
- [ ] S6 signing document is the segment-branded bind-confirmation page.
- [ ] Signature box appears in the locked page-1 location.

### Post-deploy checks (all intake segments: Bar/Roofer/Plumber/HVAC)

- [ ] Outbound carrier outreach subject includes a bracketed **`submission_public_id`** token (`[CID-SEG-YYYYMMDD-######]`) so Gmail poller can auto-match replies in S4.
- [ ] Outbound intake email includes **`Client-Submission.pdf`** ("questions answered" snapshot) plus the expected ACORD/SUPP attachments.
- [ ] If subject is missing CID tag, treat as release blocker for that segment intake deploy (carrier replies will degrade to review/no-match routing).
- [ ] Same email + different business name creates a new submission (not duplicate-suppressed).

### Non-RSS operational notes (known patterns)

- **API base URL in static HTML:** `Netlify/index.html` hardcodes the Render host. If the service name or custom domain changes, **update the `fetch` URL** and redeploy Netlify (or inject URL at build time via Netlify env + build step).
- **`X-API-Key` in browser:** The form sends a key; **the backend does not require it today** (CORS allows public intake). Treat as **client-visible**; for stricter control, add optional server-side validation against a secret env in a future change.
- **Duplicate e-sign events:** Multiple BoldSign callbacks or retries can mean duplicate notification emails; mitigate later with idempotency if needed.

---

## Netlify segment intake JS (Plumber, HVAC, Roofer wrappers)

**Publish directory:** repo `Netlify/` (usually `index.html` + `thankyou.html`). Same pattern for every segment vertical.

### Critical: one `form` binding per page script

- Declare **`const form = document.getElementById("quoteForm")`** **once** inside `DOMContentLoaded` (or reuse that variable for submit).
- **Do not** declare `const form` a **second time** in the same function scope (e.g. again above the submit listener). That is a **syntax error** in strict parsing: the entire `<script>` block fails to load.
- **Symptom:** `fetch` + `preventDefault` never run → browser performs **default form submit** (typically **GET** to the same page) → page reloads and the form **looks erased**. Often reported as “Get My Quote wiped everything.”
- **Fix:** remove the duplicate declaration; wire submit with the existing `form` reference (see Plumber `Netlify/index.html` pattern).

### Yes / No `<select>` defaults

- For questions that are **Yes / No / unanswered**, use a first option **`-- Select --`** with **`value=""`** so the user must choose deliberately and **`required`** works when you mark the control required.
- Avoid defaulting the first real option to **Yes** or **No** unless product requires it.

### Additional Insured (align across segments)

- Use the **Plumber** pattern as reference: primary question `additional_insureds_present` → conditional block with classification checkboxes, **Name / Address / City / State / Zip**, and optional **“additional Names”** second block.
- Keep **field `name` attributes** stable so **`POST /submit-quote`** → bundle mapping stays aligned with **`CID_HomeBase` / SUPP** expectations.

### Post-deploy check (segment Netlify)

- [ ] Open DevTools → **Network** → submit form: **`POST`** to **`…/submit-quote`** returns **200** and JSON `success`; then redirect to **`thankyou.html`** (or equivalent).
- [ ] **Not** acceptable as sole success signal: navigation to `thankyou.html` **without** a successful XHR/fetch (that can indicate broken JS).

### Canonical JSON body (cid-pdf-api `POST /submit-quote`)

Intake sites that target **CID-PDF-API** (not the legacy Bar-only host) should send:

- **`bundle_id`** — e.g. `HVAC_INTAKE`, `PLUMBER_INTAKE`, `ROOFER_INTAKE` (see `pdf-backend` `config/bundles.json`).
- **`segment`** — lowercase enum aligned with Postgres / poller: `hvac`, `plumber`, `roofer`, `bar` (also set as hidden `segment` on the form for snapshots).
- **`formData`** — flat object from the form (include hidden `traffic_source`, `segment`, etc.).
- **`email.to`** — segment quotes inbox, e.g. `quotes@hvacinsurancedirect.com`.

Avoid relying on legacy **`segments: ["RoofingForm", …]`** without **`bundle_id`** — use **`ROOFER_INTAKE`** so **`SUPP_ROOFER`** + ACORDs always render. **Bar** Netlify may still post to the **segment** Render host (`bar-pdf-backend`); Plumber/HVAC/Roofer use **`cid-pdf-api`**.

---

## CID-PDF-API (central Render service) — bind + Connect alignment

These apply to **`pdf-backend`** on Render (`cid-pdf-api`, etc.), not the segment-only Render wrappers.

### Customer “Issue Policy” (quote packet email link)

- **`GET /api/quotes/:quoteId/bind/initiate`** (signed query params when configured) runs **`initiateBind`** then returns an HTML page that **embeds BoldSign in an iframe** (`src/views/customer/bind-sign.ejs`), with segment branding — not only a “check your email” stub.
- After signing, BoldSign redirect uses existing **`/signed`** handling (`getSignedRedirectUrl` / env).

### Policy row + Connect documents

- On bind finalize, **`createPolicy`** inserts **`policies`**; the signed bind PDF must have **`documents.policy_id`** set to that policy id so **`GET /api/connect/policies/:policyId/documents`** returns the signed PDF for **CID Connect** (insured document list).

### Outbound email identity (operator + intake mail from central API)

- Prefer **per-segment Gmail** on the central service where implemented: **`GMAIL_USER_BAR`**, **`GMAIL_USER_ROOFER`**, **`GMAIL_USER_PLUMBER`**, **`GMAIL_USER_HVAC`** and matching **`GMAIL_APP_PASSWORD_*`**, with fallback to global **`GMAIL_USER`** / **`GMAIL_APP_PASSWORD`**.
- Set these on **CID-PDF-API Render**, not only on segment-only hosts, if that service sends S4/S5/S6 and intake-related mail.

### Gmail poller (operator inbox)

- Logs like **`Skipping message … (cid=none pdf=no)`** mean the message **did not** look like a CID-tracked carrier reply (no extractable CID id / PDF). Often **marketing or non-quote** mail — not automatically a misconfiguration.

---

## Frontend & DNS (Netlify + GoDaddy)

Goal: public quote form at `https://<segment>insurancedirect.com` pointing to the correct segment backend.

### 1. Create / connect Netlify project

- Create a Netlify site (for example `hvacinsurancedirect.com` project).
- Connect it to the frontend repo (for example `hvac-pdf-backend` with `Netlify/` as the publish directory).
- Prefer GitHub-backed deploys so every deploy is tied to a commit.

**Important runtime check:** After Netlify deploy, verify browser Network tab shows `POST https://<segment-backend>/submit-quote` (not only local domain `thankyou.html` navigation). This confirms frontend is actually calling backend intake.

### 2. Delegate DNS to Netlify

- In Netlify → **Domains**, add the custom domain (for example `hvacinsurancedirect.com`).
- Netlify shows 4 **name servers** (for example `dns1.p0x.nsone.net`, …).
- In GoDaddy (or registrar), change the domain’s **nameservers** to the Netlify values.
- Result: Netlify owns DNS for the domain (A/CNAME/TXT/MX/SPF/DKIM all live in Netlify).

### 3. SSL (Let’s Encrypt)

- Once NS delegation propagates, Netlify will automatically issue a Let’s Encrypt certificate.
- In Netlify → Domain settings, wait until the domain shows:
  - DNS verified
  - HTTPS enabled

---

## Email infrastructure (Google Workspace)

Goal: `quotes@<segment>insurancedirect.com` stays working while DNS moves and is trusted by carriers.

### 1. Preserve MX records

- Before changing nameservers, note the existing 5 Google MX records at the registrar.
- After NS points to Netlify, recreate those MX records in **Netlify DNS** (same priority and targets) so mail flow continues.

### 2. SPF

- In Netlify DNS, add a TXT record on the root (`@`) like:
  - `v=spf1 include:_spf.google.com ~all`

### 3. DKIM

- In Google Admin → Apps → Gmail → Authenticate email:
  - Generate a DKIM key for the domain.
  - Add the DKIM TXT record in Netlify DNS with the selector and value from Google.

### 4. App password for the quotes@ account

- In the Google account that owns `quotes@<segment>insurancedirect.com`:
  - Turn on 2‑Step Verification.
  - Create a Mail **App Password**.
- This 16‑character value is used by the backend to authenticate to Gmail.

---

## Backend configuration (Render, per segment)

Goal: one Render Web Service per segment (`bar-pdf-backend`, `roofer-pdf-backend`, `plumber-pdf-backend`, `hvac-pdf-backend`) with the same Dockerfile pattern and env names.

### Common Render settings

- Build: Docker (uses repo `Dockerfile`).
- Start: `npm start` → `node src/server.js`.
- Port: Express listens on `process.env.PORT || 8080`. Render sets `PORT` (typically 10000); do not hard‑code a port env var.

### Canonical environment variables

Use the same names for all segments; only values change.

| Variable | Purpose | Example (HVAC) |
|---------|---------|----------------|
| `SEGMENT` | Segment id used in packets/DB | `hvac` |
| `CARRIER_EMAIL` | Default recipient if caller does not override | `quotes@hvacinsurancedirect.com` |
| `GMAIL_USER` | Sender Gmail account | `quotes@hvacinsurancedirect.com` |
| `GMAIL_APP_PASSWORD` | 16‑character app password for `GMAIL_USER` | `***` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account for Gmail API / Sheets | `svc-…@…gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | RSA private key for the service account (with `\n` escaped) | `***` |
| `SUPABASE_URL` | Supabase project URL (shared across segments) | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (shared) | `***` |
| `OPENAI_API_KEY` | AI (quote parsing, etc.) | `***` |
| `GEMINI_API_KEY` | Gemini / Google GenAI key | `***` |
| `CORS_ORIGINS` | Optional list of allowed origins | `https://hvacinsurancedirect.com,https://www.hvacinsurancedirect.com` |

Notes:

- The email helper prefers `GMAIL_USER` / `GMAIL_APP_PASSWORD`. `EMAIL_USER` / `EMAIL_APP_PASSWORD` are legacy and should only be used where the code explicitly supports them.
- `CARRIER_EMAIL` is a fallback; callers (Netlify forms) can always override with `email.to` in the payload.

### Segment‑specific example (HVAC)

1. Render → `hvac-pdf-backend` → Environment:
   - Set:
     - `SEGMENT=hvac`
     - `CARRIER_EMAIL=quotes@hvacinsurancedirect.com`
     - `GMAIL_USER=quotes@hvacinsurancedirect.com`
     - `GMAIL_APP_PASSWORD=<App password>`
     - `GOOGLE_SERVICE_ACCOUNT_EMAIL=<from Google Cloud>`
     - `GOOGLE_PRIVATE_KEY=<escaped private key>`
     - `SUPABASE_URL=<same as other segments>`
     - `SUPABASE_SERVICE_ROLE_KEY=<same as other segments>`
     - `OPENAI_API_KEY=<shared>`
     - `GEMINI_API_KEY=<shared>`
2. CID_HomeBase:
   - Ensure `CID_HomeBase/templates/SUPP_HVAC` (assets + mapping) exists and is pushed.
3. Backend config:
   - In `src/config/forms.json` add:
     - `SUPP_HVAC` entry pointing at `CID_HomeBase/templates/SUPP_HVAC`.
   - In `src/config/bundles.json` add:
     - `HVAC_INTAKE` bundle that includes `SUPP_HVAC` + ACORD forms.

---

## Cloudflare (edge) — optional but recommended for CID Connect

When the **CID Connect** app (or a small BFF) has a public hostname:

- Use **Cloudflare** for **DNS**, **TLS**, and **WAF** (rate limiting, bot fight mode) in front of the app or API edge.
- Prefer **no raw API keys in the mobile app**: either **Supabase Edge Functions** or **Cloudflare Workers** (or `CID-PDF-API` only) hold secrets and forward authenticated requests to Render.
- Document the final hostname pattern here when production URLs are fixed (e.g. `connect.example.com` → Worker → `cid-pdf-api.onrender.com`).

Details and division of labor (Famous vs `pdf-backend`): [CID_CONNECT.md](./CID_CONNECT.md).

---

## What not to do

- Do not commit `.env` or keys.
- Do not rely on “run this script on the server” or SSH-only steps for normal deploy.
- Do not document secrets; document variable **names** and purpose only.
- Do not point Netlify only at a “thank you” page without verifying **`POST /submit-quote`** in the browser Network tab (see Bar section above).

---

## Revision log (docs)

| Date | Change |
|------|--------|
| 2026-03-19 | Bar Netlify→Bind path, env notes, post-deploy checks, non-RSS operational items; locked baseline for audit. |
| 2026-03-19 | Moved to `CID-docs/`; canonical copy outside segment backends. |
| 2026-03-23 | Added segment-wide deployment invariants for CID-tagged outreach subjects and `Client-Submission.pdf` attachment verification. |
| 2026-03-26 | Added centralized bind-confirmation signing template notes, AI letter fallback checks, and updated duplicate submission behavior check. |
| 2026-03-30 | Added Cloudflare notes for CID Connect; pointer to `CID_CONNECT.md`. |
| 2026-04-17 | Netlify intake: duplicate `const form` gotcha, Yes/No select defaults, Additional Insured alignment; CID-PDF-API: customer bind iframe, `policy_id` on signed doc for Connect, per-segment Gmail env on central API, poller skip note. |
| 2026-04-17 | `submit-quote` segment resolution (`bundle_id` + `formData.segment`); Gmail segment inference from `SUPP_*`; canonical `POST` body for Plumber/HVAC/Roofer; Roofer Netlify migrated to `ROOFER_INTAKE`. |
