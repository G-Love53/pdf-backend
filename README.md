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
- **Gmail poller:** Runs on a schedule (default cron **every 3 minutes** when **`ENABLE_GMAIL_POLLING=true`**). Ingestion requires **CID token + PDF**; other mail may be skipped and marked read. **Dedupe** logic lives in **`src/jobs/gmailPoller.js`** (`dedupeCarrierMessagesForGmail`). Optional **one-off** cleanup: **`npm run dedupe:carrier-messages`** and/or browser **`POST /operator/maintenance/dedupe-carrier-messages`** (requires **`CID_MAINTENANCE_SECRET`**) — ops-only, destructive to duplicate-linked rows.
- **March 2026:** Duplicate rows were traced to **historical bursts**; **recent-window** duplicate checks were clean at verification — see **`cid-connect/docs/WORKFLOW_HANDOFF.md`**.

## CID Connect API (`/api/connect`)

- **Routes:** `src/routes/connectApi.js` — profile, policies, quotes, documents, COI, claims, carrier knowledge search, **`POST /api/connect/chat`** (Claude primary, Gemini fallback — `src/services/connectChatService.js`).
- **Auth (Phase 1):** `src/middleware/connectAuth.js` — requires **`X-User-Email`**; optional **`X-User-Id`** (Supabase user UUID) for `clients.famous_user_id` mapping.
- **Migration:** Run **`migrations/007_connect_api.sql`** on Render `DATABASE_URL` (adds `famous_user_id`, KB tables, `coi_requests`, `claims` if missing).
- **Chat env (Render):** `ANTHROPIC_API_KEY` (required for Claude), optional `ANTHROPIC_CONNECT_CHAT_MODEL`, `CONNECT_CHAT_TIMEOUT_MS`, `GEMINI_API_KEY` + `GEMINI_CONNECT_CHAT_MODEL` for fallback.
- **Smoke test (bash):** after deploy, run **`scripts/smoke-connect-api.sh`** with `CID_API_URL` and `TEST_EMAIL` set (see script header).
