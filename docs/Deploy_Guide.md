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

## Pipeline database (`cid-postgres`) — where **`DATABASE_URL`** points

**Do not guess between Postgres instances.** One rule:

- **Submissions, quotes, `segment_type`, policies, bind, operator queues, Connect bridge tables on the API** — all live in the database whose URL is **`DATABASE_URL`** on the **CID-PDF-API** Render service (commonly a **Render Postgres** instance such as `cid_postgres`). This is **`cid-postgres`** in internal language.

**CID Connect / Famous Supabase** is a **different** product surface: browser auth, `app_settings`, and other SPA concerns. **`migrations/*.sql` in this repo apply to `DATABASE_URL` (cid-postgres), not to Connect’s Supabase project**, unless you have intentionally pointed `DATABASE_URL` at that same Supabase Postgres (unusual — verify in Render env before running anything).

### Where to run `psql` / SQL migrations (RSS)

1. **Confirm target:** Render → **CID-PDF-API** → **Environment** → copy **`DATABASE_URL`**. Note host and database name — that is the only DB for pipeline migrations.
2. **Run SQL** using any of:
   - **Render** → **Postgres** (the instance backing that URL) → **Connect** / **psql** / web SQL if your plan includes it; or
   - **Local:** `psql "$DATABASE_URL" -f migrations/NNN_….sql` (install `psql` via Homebrew `libpq`, Postgres.app, etc.); or
   - **GUI:** TablePlus / Postico / DBeaver using the **same** URL Render shows as **External Database URL** (include `sslmode=require` when required).
3. **Never** run pipeline migrations in the **Famous** or **Connect-only** Supabase SQL editor unless that project’s URL **is** your `DATABASE_URL` (verify first).

### New segment example

Adding a segment (e.g. `fitness`) requires an **`ALTER TYPE segment_type`** (and related function updates) **on cid-postgres** — see `migrations/011_segment_fitness.sql`. After deploy, confirm with:

```sql
SELECT enumlabel FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'segment_type'
ORDER BY enumsortorder;
```

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
  - **Submission received (all segments):** after `recordSubmission` commits, **`notifySubmissionReceived`** sends a short plain-text email to that segment’s agent/quotes inbox (same addresses as **`src/config/segmentAgentInbox.js`** / Gmail poller), subject prefix **`[CID][Submission]`**, so ops see a ping separate from the long **carrier packet** email from `/submit-quote`.
  - **Bar-only agent alerts** (still Bar-scoped in code): **`[CID][Carrier][Quote]`**, **`[CID][Bind]`**, **`[CID][Carrier][UW]`** — see `src/services/agentNotificationService.js`. **`[CID][Client][Packet]`** uses **`getSegmentAgentInboxEmail`** for every segment (same inbox list as submission ping when configured).
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
2. **Render API (`src/server.js`)** — `POST /submit-quote`: optional duplicate detection → `recordSubmission()` (Postgres via `DATABASE_URL`) → **optional short `[CID][Submission]` email** to the segment’s agent inbox (`notifySubmissionReceived`) → renders PDF bundle from **`CID_HomeBase/templates`** per `config/bundles.json` and `config/forms.json` → emails **carrier packet** (Gmail) using `email.to` from the request, with `[CID-SEG-YYYYMMDD-XXXXXX]` in subject when DB write succeeds → optional **client submission snapshot** PDF to R2 + `documents.application_original`.
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
| `CID_APP_URL` | Public **CID Connect** origin for welcome/bind emails (e.g. `https://cid-connect.netlify.app`). **Render only** — read by `bindEmailService.js` and bind flows; not a Netlify `VITE_*` var. |
| `ENABLE_POLICY_INDEXER` | Enable policy chunk index cron (`true`/`false`) |
| `POLICY_INDEXER_CRON` | Cron for policy indexer (default `*/5 * * * *`) |
| `POLICY_INDEXER_BATCH_SIZE` | Docs scanned per index run (optional) |
| Optional | `ENABLE_FOLLOWUP_SCHEDULER`, `CID_BRAND_NAME`, etc. — see segment backend `src/constants/README.md`. |

### Post-deploy checks (Bar)

- [ ] Netlify live: submit form → Network shows **`POST`** to **Render** `/submit-quote` (200), not only navigation to `thankyou.html`.
- [ ] Email: carrier packet includes **`submission_public_id`** in subject when DB succeeded.
- [ ] Email subject format includes bracketed CID tag for poller matching (example): **`[CID-BAR-YYYYMMDD-######] GL Quote Request - <Applicant>`**.
- [ ] Render logs: no errors on `/submit-quote` or template resolution (`CID_HomeBase` present in Docker image).
- [ ] Bind: BoldSign webhook or redirect finalize creates **`policies`** row; logs may show `[policyService] policy row ready`.
- [ ] S5 sales letter renders through fallback chain (Claude -> Gemini -> deterministic template if needed).
- [ ] S5 **client packet email**: Claude sales letter appears **in the HTML body** (summary + Issue Policy / question CTAs below); **plain-text MIME part** included for HTML-stripping clients; default **subject** is segment-facing and **does not include carrier name** (operator may override); letter **sign-off** uses **“{Segment} Insurance Direct”** (e.g. HVAC Insurance Direct) for brand consistency with vertical outreach.
- [ ] S6 signing document is the segment-branded bind-confirmation page.
- [ ] Signature box appears in the locked page-1 location.
- [ ] S6 queue shows status badges (`Ready to Send`, `Awaiting Signature`, `Signed`, `Policy Package Received`).
- [ ] S6 **Docs Reconcile** lookup/upload works for a known CID and writes `policy.document.manual_linked` timeline event.
- [ ] Operator Home "Connect: policy / dec PDFs (today)" increments after policy upload/link.

### Post-deploy checks (all intake segments: Bar/Roofer/Plumber/HVAC/Fitness)

- [ ] Outbound carrier outreach subject includes a bracketed **`submission_public_id`** token (`[CID-SEG-YYYYMMDD-######]`) so Gmail poller can auto-match replies in S4.
- [ ] Outbound intake email includes **`Client-Submission.pdf`** ("questions answered" snapshot) plus the expected ACORD/SUPP attachments.
- [ ] **Short ops email:** after a successful DB insert from `/submit-quote`, the segment’s quotes inbox (per **`segmentAgentInbox.js`**) receives **`[CID][Submission]`** with submission id + client name (plain text). Requires **`GMAIL_USER_*` / `GMAIL_APP_PASSWORD_*`** (or default **`GMAIL_USER`**) for that segment on Render — same credential family as outbound packet mail.
- [ ] If subject is missing CID tag, treat as release blocker for that segment intake deploy (carrier replies will degrade to review/no-match routing).
- [ ] Same email + different business name creates a new submission (not duplicate-suppressed).

### Non-RSS operational notes (known patterns)

- **API base URL in static HTML:** `Netlify/index.html` hardcodes the Render host. If the service name or custom domain changes, **update the `fetch` URL** and redeploy Netlify (or inject URL at build time via Netlify env + build step).
- **`X-API-Key` in browser:** The form sends a key; **the backend does not require it today** (CORS allows public intake). Treat as **client-visible**; for stricter control, add optional server-side validation against a secret env in a future change.
- **Duplicate e-sign events:** Multiple BoldSign callbacks or retries can mean duplicate notification emails; mitigate later with idempotency if needed.

---

## Netlify segment intake JS (Bar, Plumber, HVAC, Roofer, Fitness)

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

Intake sites should send:

- **`bundle_id`** — e.g. `HVAC_INTAKE`, `PLUMBER_INTAKE`, `ROOFER_INTAKE` (see `pdf-backend` `config/bundles.json`).
- **`segment`** — lowercase enum aligned with Postgres / poller: `hvac`, `plumber`, `roofer`, `bar`, `fitness` (also set as hidden `segment` on the form for snapshots).
- **`formData`** — flat object from the form (include hidden `traffic_source`, `segment`, etc.).
- **`email.to`** — segment quotes inbox, e.g. `quotes@hvacinsurancedirect.com`.

Avoid relying on legacy **`segments: ["RoofingForm", …]`** without **`bundle_id`** — use **`ROOFER_INTAKE`** so **`SUPP_ROOFER`** + ACORDs always render. **Bar** Netlify (and Plumber/HVAC/Roofer/Fitness) posts to **`cid-pdf-api`** **`POST /submit-quote`** with **`bundle_id`** + **`segment`**.

---

## CID-PDF-API (central Render service) — bind + Connect alignment

These apply to **`pdf-backend`** on Render (`cid-pdf-api`, etc.), not the segment-only Render wrappers.

### Customer “Issue Policy” (quote packet email link)

- **`GET /api/quotes/:quoteId/bind/initiate`** (signed query params when configured) runs **`initiateBind`** then returns an HTML page that **embeds BoldSign in an iframe** (`src/views/customer/bind-sign.ejs`), with segment branding — not only a “check your email” stub.
- After signing, BoldSign redirect uses existing **`/signed`** handling (`getSignedRedirectUrl` / env).

### Policy row + Connect documents

- On bind finalize, **`createPolicy`** inserts **`policies`**; the signed bind PDF must have **`documents.policy_id`** set to that policy id so **`GET /api/connect/policies/:policyId/documents`** returns the signed PDF for **CID Connect** (insured document list).
- Carrier post-bind policy package auto-link path (poller):
  - policy docs can be linked as `policy_original` or `endorsement`
  - indexer is triggered immediately after auto-link
  - if email cannot auto-match (commonly no CID token), operator uses **S6 -> Docs Reconcile** manual intake.

### Policy indexing + retrieval

- Apply both migrations on prod DB:
  - `migrations/009_policy_document_chunks.sql`
  - `migrations/010_policy_index_priority_and_endorsement_role.sql`
- Backfill once after deploy:
  - `npm run indexer:policy-docs:backfill`
- Verify:
  - `policy_document_chunks` has rows with `index_status='indexed'`
  - `endorsement` rows carry `document_priority=1`
  - Connect chat retrieves policy excerpts for coverage prompts.

### Connect identity + CORS checks

- CORS preflight must be handled before `/api/connect` auth routing so browser `OPTIONS` requests succeed and real `GET/POST` follow.
- Connect identity headers:
  - required: `X-User-Email`
  - optional: `X-User-Id` (Supabase UUID)
- If `X-User-Id` is present and mismatched with `clients.famous_user_id`, API returns identity conflict by design.
- Do not use synthetic UUID values in policy/docs smoke tests unless you intentionally test conflict handling.

### Connect launch smoke (all segments)

Run these per segment test account:

1. `GET /api/connect/policies` with real user email returns expected policy.
2. `GET /api/connect/policies/:policyId/documents` returns expected roles:
   - `signed_bind_docs`
   - `policy_original` (and optionally `endorsement` / `declarations_original`)
3. Connect UI:
   - policy card renders
   - documents view opens and download route works
   - Am I Covered answers policy-backed coverage correctly and uses "not shown" when absent.

### Outbound email identity (operator + intake mail from central API)

- Prefer **per-segment Gmail** on the central service where implemented: **`GMAIL_USER_BAR`**, **`GMAIL_USER_ROOFER`**, **`GMAIL_USER_PLUMBER`**, **`GMAIL_USER_HVAC`** and matching **`GMAIL_APP_PASSWORD_*`**, with fallback to global **`GMAIL_USER`** / **`GMAIL_APP_PASSWORD`**.
- Set these on **CID-PDF-API Render**, not only on segment-only hosts, if that service sends S4/S5/S6 and intake-related mail.

### Gmail poller (operator inbox)

- Logs like **`Skipping message … (cid=none pdf=no)`** mean the message **did not** look like a CID-tracked carrier reply (no extractable CID id / PDF). Often **marketing or non-quote** mail — not automatically a misconfiguration.

#### Gmail poller vs SMTP (do not confuse)

- **Outbound send** (`sendWithGmail` / Nodemailer) uses **`GMAIL_USER_*`** + **`GMAIL_APP_PASSWORD_*`** (16‑character Google **App passwords**). See **Email infrastructure** below.
- **Inbound poller** (`src/jobs/gmailPoller.js`) uses **OAuth 2.0**, not app passwords. On **CID-PDF-API Render** it needs:
  - **`GMAIL_CLIENT_ID`**, **`GMAIL_CLIENT_SECRET`**, **`GMAIL_REDIRECT_URI`**
  - **`GMAIL_REFRESH_TOKEN_BAR`**, **`GMAIL_REFRESH_TOKEN_ROOFER`**, **`GMAIL_REFRESH_TOKEN_PLUMBER`**, **`GMAIL_REFRESH_TOKEN_HVAC`**  
  Segment key comes from the inbox domain (e.g. `quotes@hvacinsurancedirect.com` → **`GMAIL_REFRESH_TOKEN_HVAC`**).

#### When logs show `invalid_grant` (one segment, e.g. `[hvac]`)

Google rejected the **refresh token** for that segment’s mailbox (revoked, rotated, wrong OAuth client, or password/security event). **Renew only that segment’s refresh token** on Render — other segments can keep working.

#### Renew a segment refresh token (OAuth 2.0 Playground) — line by line

**A. Google Cloud Console (OAuth client)**

1. Open **https://console.cloud.google.com/apis/credentials** (project must be the one that owns **`GMAIL_CLIENT_ID`** on Render, e.g. **CID-Backend**).
2. Under **OAuth 2.0 Client IDs**, open your **Web** client (e.g. **`cid-gmail-poller`**).
3. Under **Authorized redirect URIs**, ensure this URI exists (add if missing, then **Save**):  
   **`https://developers.google.com/oauthplayground`**

**B. Render (copy values you will paste into Playground)**

4. Open **Render** → **CID-PDF-API** → **Environment**.
5. Reveal and copy **`GMAIL_CLIENT_ID`** and **`GMAIL_CLIENT_SECRET`** (same client as in Cloud Console).

**C. OAuth 2.0 Playground**

6. Open **https://developers.google.com/oauthplayground**.
7. Click the **gear** (⚙️) → **OAuth 2.0 configuration**.
8. Check **Use your own OAuth credentials**.
9. Paste **OAuth Client ID** = Render **`GMAIL_CLIENT_ID`**, **OAuth Client secret** = Render **`GMAIL_CLIENT_SECRET`**.
10. Leave **OAuth flow** = Server-side, **OAuth endpoints** = Google, **Access type** = **Offline**, **Force prompt** = **Consent Screen** (so a refresh token is returned).
11. Close the gear panel.
12. In the **left** list (**Step 1**), expand **Gmail API v1** and check **only**:  
    **`https://www.googleapis.com/auth/gmail.modify`**
13. Click **Authorize APIs**.
14. Sign in with the **same Gmail address the poller reads for that segment** (e.g. **`quotes@hvacinsurancedirect.com`** for HVAC — not a different admin mailbox unless that mailbox *is* the inbox).
15. Complete consent.
16. Open **Step 2: Exchange authorization code for tokens**.
17. Click **Exchange authorization code for tokens**.
18. Copy the **Refresh token** value (starts with `1//…` — copy all of it). Ignore **Access token** for Render storage.

**D. Render (install token + reload)**

19. Set the matching env var on **CID-PDF-API** (example for HVAC): **`GMAIL_REFRESH_TOKEN_HVAC`** = pasted refresh token.
20. Confirm **`GMAIL_REDIRECT_URI`** on Render matches an **Authorized redirect URI** on the same OAuth client. If you used Playground, it must be **`https://developers.google.com/oauthplayground`** (exact string).
21. **Save** env → **Restart** or **redeploy** the service so the new token is loaded.
22. Watch the next poller run: **`[hvac]`** (or whichever segment) should no longer log **`invalid_grant`**.

**Workspace admin (`admin.google.com`)** is only needed if consent or API access is **blocked by policy** for the quotes mailbox; it does not mint refresh tokens by itself.

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

### 5. Google Postmaster Tools (outbound campaigns — RSS)

**Reliable:** see spam rate, authentication failures, and reputation signals for **Gmail recipients** before small issues become inbox placement problems. **Scalable:** same checklist for every segment sending domain. **Sellable:** third‑party audit trail that DNS + authentication are monitored, not guessed.

- Add each **campaign sending domain** (and any subdomain you mail from) in [Google Postmaster Tools](https://postmaster.google.com/) and complete verification (TXT/DNS per Google’s wizard).
- Align Postmaster domains with **SPF**, **DKIM**, and **DMARC** already documented above — mismatched “From” vs authenticated domain is a common cause of spam-folder placement.
- **Instantly** (or any ESP) must use the same authenticated identities you monitor in Postmaster; do not mix unauthenticated “friendly From” with a different signing domain without explicit alignment.
- Postmaster does **not** replace per-message testing — still send seed tests to Gmail/Outlook after DNS or template changes.

---

## GitHub Actions — Leg 2 Robot Heartbeat (RSS)

**Reliable:** scheduled wake checks must hit a **real liveness route** on the service you deploy. **CID-PDF-API** (`pdf-backend` on Render, e.g. `cid-pdf-api`) exposes **`GET /healthz`** — use that in `.github/workflows/heartbeat.yml`.

- **Do not** point the unified API heartbeat at **`POST /check-quotes`** — that route exists on some **legacy segment-only** Render services, not on CID-PDF-API (returns **404**, fails `curl --fail`, spams failure email).
- **Hardening:** concurrency group, job timeout, and `curl` retries/backoff reduce noise during GitHub Actions incidents; transient platform outages still require checking [GitHub Status](https://www.githubstatus.com/).

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
| 2026-04-17 | Gmail poller: OAuth vs app password; **`invalid_grant`**; step‑by‑step OAuth Playground renewal for **`GMAIL_REFRESH_TOKEN_*`** (Cloud Console → Playground → Render). |
| 2026-04-22 | Added S6 state badges + Docs Reconcile manual intake workflow; Connect-first policy delivery copy; policy indexing migrations (`009`, `010`) and endorsement priority behavior. |
| 2026-04-23 | Added Connect launch checks: CORS preflight ordering, identity mapping behavior (`X-User-Id` vs `famous_user_id`), and all-segment policy/docs + chat validation checklist. |
| 2026-05-06 | Postmaster Tools checklist for campaign sending domains; GitHub Actions heartbeat notes (`GET /healthz` on CID-PDF-API vs legacy `/check-quotes`); S5 client email post-deploy checks (body letter, plaintext, subject, segment sign-off). |
| 2026-05-07 | Pipeline DB vs Connect/Famous Supabase: canonical **`DATABASE_URL`** (cid-postgres), where to run **`psql`** / migrations, segment enum verification query. |
| 2026-05-14 | **`[CID][Submission]`** plain-text ping after **`recordSubmission`** for **all** segments (**`notifySubmissionReceived`** → **`getSegmentAgentInboxEmail`**); Phase 2 / flow / checklist updates in this guide. |
