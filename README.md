# pdf-backend (Bar segment)

**CID Leg 2 — Bar segment.** Renders ACORD + supplemental PDFs from CID_HomeBase templates, emails via Gmail API.

* **Documentation (all segments):** not in this repo — see **[`DOCUMENTATION.md`](./DOCUMENTATION.md)** → canonical **`CID-docs/`** folder (deploy, audit, architecture, new-segment guide).
* **Segment:** `bar` (set via `SEGMENT` env; default `bar`).
* **RSS base:** This repo is the reference for cleaning and replicating segments (Roofer, Plumber, HVAC, etc.). Same structure, segment-specific config only.
* **Templates:** CID_HomeBase submodule (canonical). Bar uses SUPP_BAR; bundles in `src/config/bundles.json`.

**CID_HomeBase submodule:** On GitHub you’ll see `CID_HomeBase @ a1d0f5b` (or another short hash). That’s the **commit** of CID_HomeBase this repo is using, not a file path. SUPP_BAR lives at `CID_HomeBase/templates/SUPP_BAR/`. To use the latest SUPP_BAR (or any HomeBase change), update the submodule and push: run `bash CID_HomeBase/scripts/deploy-bar-backend.sh` from CID_HomeBase (after pushing your HomeBase changes to `main`). That script pulls latest `main` into the submodule, commits the new commit ref in pdf-backend, and pushes so Render deploys with the updated templates.

Deploy: Docker (Render). Build clones CID_HomeBase when submodules are not available.

## CID-PDF-API — data store and Gmail poller (read once)

- **Postgres (`DATABASE_URL` on Render):** Canonical DB for **submissions, quotes, `carrier_messages`, operator queue, bind**, etc. — **not** the Famous/Supabase project used for Connect **auth** (unless you replicate). Debug SQL for **`carrier_messages`** belongs on this host.
- **Gmail poller:** Runs on a schedule (default cron **`*/15 * * * *`** ≈ **every 15 minutes** when **`ENABLE_GMAIL_POLLING=true`**; override with **`GMAIL_POLL_CRON`**). Ingestion requires **CID token + PDF**; other mail may be skipped and marked read. **Dedupe** logic lives in **`src/jobs/gmailPoller.js`** (`dedupeCarrierMessagesForGmail`). Optional **one-off** cleanup: **`npm run dedupe:carrier-messages`** and/or browser **`POST /operator/maintenance/dedupe-carrier-messages`** (requires **`CID_MAINTENANCE_SECRET`**) — ops-only, destructive to duplicate-linked rows.
- **March 2026:** Duplicate rows were traced to **historical bursts**; **recent-window** duplicate checks were clean at verification — see **`cid-connect/docs/WORKFLOW_HANDOFF.md`**.

## CID Connect API (`/api/connect`)

- **Routes:** `src/routes/connectApi.js` — profile, policies, quotes, documents, COI, claims, carrier knowledge search, **`POST /api/connect/chat`** (Claude primary, Gemini fallback — `src/services/connectChatService.js`).
- **Auth (Phase 1):** `src/middleware/connectAuth.js` — requires **`X-User-Email`**; optional **`X-User-Id`** (Supabase user UUID) for `clients.famous_user_id` mapping.
- **Identity rule:** If `X-User-Id` is provided and does not match `clients.famous_user_id`, Connect APIs return identity conflict by design. Browser sessions should send the real Supabase user id; do not test with synthetic UUIDs.
- **Migration:** Run **`migrations/007_connect_api.sql`** on Render `DATABASE_URL` (adds `famous_user_id`, KB tables, `coi_requests`, `claims` if missing).
- **Chat env (Render):** `ANTHROPIC_API_KEY` (required for Claude), optional `ANTHROPIC_CONNECT_CHAT_MODEL`, `CONNECT_CHAT_TIMEOUT_MS`, `GEMINI_API_KEY` + `GEMINI_CONNECT_CHAT_MODEL` for fallback.
- **Packet / sales letter (S5 preview & email):** set **`CLAUDE_LETTER_TIMEOUT_MS=28000`** on Render (explicit override; code default matches). Short values caused Sonnet letter calls to abort (`This operation was aborted`) before the response returned. Optional: `GEMINI_API_KEY` + `GEMINI_LETTER_MODEL` for Gemini fallback when Claude fails; fix quota/billing if you see 429. **`OPENAI_API_KEY`** is not referenced in this repo’s letter or chat code yet — possible future fallback if wired in.
- **Smoke test (bash):** after deploy, run **`scripts/smoke-connect-api.sh`** with `CID_API_URL` and `TEST_EMAIL` set (see script header).

### Connect data source split (important)

- **Supabase is still used for Connect auth/session** (browser login + session state).
- **Insurance policy/doc/claims/COI data is served from cid-postgres via `/api/connect`** when `VITE_CID_API_URL` is set in Connect frontend build.
- Result: seeing policy/docs in Connect depends on both:
  - valid Supabase auth session for the user
  - correct client mapping in cid-postgres (`clients.primary_email` and `clients.famous_user_id` when present)

### Launch verification (Connect policy/docs)

- `GET /api/connect/policies` should return at least one active policy for the test user email.
- `GET /api/connect/policies/:policyId/documents` should return `policy_original` + `signed_bind_docs` (and optional endorsements).
- In Connect UI:
  - Policy card visible
  - Documents view opens and can open/download files
  - "Am I Covered?" answers grounded in policy data/excerpts.

## Policy document indexing + S6 Docs Reconcile (2026-04)

- **Tables/migrations:** `policy_document_chunks` via `migrations/009_policy_document_chunks.sql`; endorsement + priority support via `migrations/010_policy_index_priority_and_endorsement_role.sql`.
- **Indexer worker:** `src/workers/policyIndexer.js`
  - scheduled when `ENABLE_POLICY_INDEXER=true` (default cron `*/5 * * * *` via `POLICY_INDEXER_CRON`)
  - scripts:
    - `npm run indexer:policy-docs`
    - `npm run indexer:policy-docs:backfill`
- **Retrieval behavior:** `connectChatEnrichment.js` retrieves policy chunks by priority then rank:
  - `endorsement` priority 1
  - `policy_original` / `declarations_original` priority 2
- **S6 operator UX:** `src/views/operator/bind-queue.ejs`
  - tabbed workspace: **Bind Workflow** + **Docs Reconcile**
  - clickable CID in Bind Workflow auto-fills Docs Reconcile lookup
  - Docs Reconcile supports manual upload + role link (`signed_bind_docs`, `policy_original`, `declarations_original`, `endorsement`) and triggers indexer for policy roles
  - queue badges: `Ready to Send`, `Awaiting Signature`, `Signed`, `Policy Package Received`
