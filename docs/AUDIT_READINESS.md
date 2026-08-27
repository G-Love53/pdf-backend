## CID-PDF-API — Audit Readiness (S1-S6)

> **Canonical location:** `CID-docs/AUDIT_READINESS.md` — **outside** any segment backend repo. Applies to **all segments** (Bar, Roofer, Plumber, future RSS). See [README](./README.md).

**Locked baseline (Bar):** 2026-03-19 — Flow from Netlify intake through BoldSign bind reviewed; see [CID_ARCHITECTURE.md](./CID_ARCHITECTURE.md) and [Deploy_Guide.md](./Deploy_Guide.md) for the end-to-end map.

### What is auditable now

- **Client + submission identity**
  - `clients`: immutable `client_id`, primary email, basic PII.
  - `submissions`: `submission_public_id` (CID‑SEG‑YYYYMMDD‑XXXXXX), original `raw_submission_json` (never mutated), `segment`, `source_domain`, and status history.
  - Duplicate-aware intake controls:
    - `submission.duplicate_detected` timeline event when a duplicate is detected.
    - Operator/customer-driven resubmission path via `force_resubmit=true` with `submission_intent` (`corrected` or `new`) captured in `raw_submission_json`.
- **Carrier correspondence**
  - `carrier_messages`: raw inbound/outbound carrier emails with headers, body, and Gmail IDs.
  - `documents` with `document_role='carrier_quote_original'`: canonical pointer to the exact PDF received from the carrier (hash + R2 path).
- **Client submission snapshot PDF (S1-S3)**
  - At `/submit-quote`, backend generates a canonical PDF snapshot of what the client submitted (`CLIENT_SUBMISSION` html template).
  - Stored in R2 at `submissions/{segment}/{submission_public_id}/client-submission.pdf`.
  - Recorded in `documents` as `document_role='application_original'` with hash/path metadata.
  - Included as an extra attachment in carrier outreach packet emails.
- **Quote and extraction trail**
  - `quotes`: carrier, segment, match/extraction confidence, and core quote fields (premium, dates, status).
  - `quote_extractions`:
    - `raw_extraction_json`: full model output, immutable.
    - `reviewed_json`: agent‑confirmed values; this is what packets are built from.
    - `review_status`, `reviewed_by`, `reviewed_at`, `is_active` (single active per quote enforced by trigger).
- **Packet generation and delivery**
  - `documents`:
    - `sales_letter_generated`: the exact sales‑letter PDF attached to the client email.
    - `quote_packet_sent`: the combined packet (sales letter + summary + carrier quote) actually delivered.
    - Each document has `sha256_hash`, `storage_path`, `created_by`, and timestamps for integrity and provenance.
  - `quote_packets`:
    - Links `quote_id` to `extraction_id` and the final packet document.
    - Records `status` (`sent`), `created_by`, and `sent_at`.
  - `timeline_events`:
    - Append‑only log of key milestones:
      - `submission.received` (intake).
      - `submission.duplicate_detected` (duplicate capture, no automatic re-outreach unless forced).
      - `quote.received` (poller ingestion).
      - `extraction.reviewed` / `extraction.skipped` (S4).
      - `packet.previewed` / `packet.sent` / `packet.resent` (S5).
      - `bind.*` events in S6 (initiated, viewed, signed, etc.).

### How to reconstruct “what the client saw”

Given a `submission_public_id` or `quote_id`:

1. Use `submissions` to resolve `submission_id` and segment.
2. From `quotes`, find the relevant `quote_id` and carrier(s).
3. From `quote_packets`, locate the `packet_id` and `packet_document_id` that was `sent`.
4. From `documents`, fetch:
   - `quote_packet_sent` (combined packet actually sent).
   - `sales_letter_generated` (if needed for comparison).
   - `carrier_quote_original` (what the carrier provided).
   - `application_original` (client-submitted application snapshot captured at intake).
5. From `quote_extractions`, read the `reviewed_json` row linked via `extraction_id` on `quote_packets` to see the structured data that backed the packet.
6. From `timeline_events`, read the full event stream to show when each step happened and by whom.

### Operator actions and controls

- **S4 Extraction Review**
  - Every S4 action is represented as:
    - A mutation on `quote_extractions` (`reviewed_json`, `review_status`, `reviewed_by`, `reviewed_at`).
    - A status transition on `work_queue_items` (`queue_type='extraction_review'`, `status` from `open` → `resolved` or `dismissed`).
    - A `timeline_events` record with `event_type='extraction.reviewed'` or `event_type='extraction.skipped'`.
- **S5 Packet Builder**
  - Preview:
    - Generates a transient PDF (not persisted) and logs `timeline_events` with `event_type='packet.previewed'`.
  - Finalize & send:
    - Persists final PDFs in `documents` and `quote_packets`.
    - Sends client email via Gmail (subject + recipients recorded in `timeline_events.event_payload_json`).
    - Updates `quotes.status='sent'` and `submissions.status='sent_to_client'`.
  - Resend:
    - Uses the existing combined packet `documents` row; does not regenerate.
    - Logs `timeline_events` with `event_type='packet.resent'` and increments resend metadata in `quote_packets` (schema already supports extension for `resend_count`).

### S6 — Bind, e-sign, and policy (Bar / BoldSign)

- **Bind initiation** — `bind_requests` row links `quote_id`, `packet_id`, optional `document_id` for the unsigned bind PDF; **BoldSign** sends the sign request; **`bind_requests.hellosign_request_id`** holds the **BoldSign document id** (legacy column name).
- **Completion paths (auditable)** — Finalize runs on **BoldSign webhook** (`POST /api/webhooks/boldsign`) and/or **GET `/operator` redirect** after signing (webhook lag / failover). **HelloSign webhook** (`/api/webhooks/hellosign`) still processes legacy Dropbox Sign flows that store a HelloSign signature request id in the same column.
- **Artifacts** — Signed PDF uploaded to R2; **`documents`** row with hash (`sha256_hash`); timeline events for bind milestones (`bind.*`).
- **Policy** — **`policies`** row created in the same successful finalize transaction as status updates (`createPolicy()`), with generated **`policy_number`** (not a manual operator field). Idempotent on `bind_request_id`; `bound_by` is UUID or null (not arbitrary strings).
- **Client / agent delivery** — Bind confirmation and welcome emails; attachments per `bindEmailService` / agent notifications. **PDF access for UI:** `GET /api/documents/:documentId/download` → presigned R2 redirect (not a public bucket URL requirement).
- **Operator dashboard** — Counts and **`/operator/today/*`** lists use **UTC `CURRENT_DATE`** on the server; reconcile timestamps when comparing to local “today.”

### ConnectQuote — Coterie instant bind (planned audit trail)

**Status:** Sandbox API validated (2026-06-04); **code + webhook not live** until CO producer license confirmed. Spec: [`coterie-integration.md`](./coterie-integration.md).

**Target auditable artifacts (same spine as BoldSign S6):**

- `submissions.raw_submission_json` — includes `quote_rail`, `AKHash`, campaign prefill, Coterie `applicationId` when returned
- Timeline events — e.g. `coterie.application.created`, `coterie.quote.bindable`, `coterie.policy.bound` (exact types TBD at implementation)
- `policies` row via shared `createPolicy()` — distinguish **`bind_source: coterie`** (column or `coverage_data` metadata TBD)
- Coterie webhook payload retained (event log table or `timeline_events.event_payload_json`) for premium, dates, policy id
- Policy documents — Coterie doc URL ingested to R2 + `documents` for Connect retrieval
- **No BoldSign** on this rail — bind/payment evidence is Coterie/Stripe + webhook, not `signed_bind_docs`

**Gaps until implemented:** webhook handler, idempotent finalize, fixture tests, operator visibility for Coterie-bound policies.

### ConnectQuote — GUARD Workers’ Comp (live)

**Status:** Live on ConnectQuote (Aug 2026, CO pilot). Full path: main-form WC opt-in → Coterie BOP quote → GUARD NBQ indication → NBS/BND → `finalizeGuardBind()` → **`policies`** row (`bind_source: guard`). Spec: [`guard-integration.md`](./guard-integration.md).

**Audit spine (same submission, second policy):**

- Timeline `guard.indicated` / `guard.bound` + GUARD `PolicyNumber` as `carrier_quote_ref`
- `policies` via `createPolicy()` with `coverage_data.bind_source = 'guard'`, `policy_type = WC`
- Doc push webhook → R2 + `documents` (partner-hosted endpoint; GUARD origin IPs in packet) — **not wired**
- Bind evidence is GUARD BND + **GUARD direct bill** — **not** CID card/ACH, **not** BoldSign

**Gaps (ops):** doc webhook ingest → R2; multi-state class-code expansion as pilot grows.

### Known operational gaps (audit awareness)

- **Intake `X-API-Key`:** Netlify may send a key; server **does not enforce** it today — public intake by design unless optional middleware is added.
- **Duplicate notifications:** Multiple webhook or redirect finalize attempts may produce duplicate emails in edge cases; timeline + `documents`/`policies` remain the source of truth for whether bind completed.
- **ConnectQuote:** Coterie bind audit path not yet in production — traditional BoldSign trail remains canonical today.

---

### Outreach / list quality (Aug 2026)

- **Instantly → ConnectQuote** attribution via `ch` / `src` / `cid` on every prefilled URL; persisted on submission.
- **ZIP prefill:** wrong ZIP worse than blank — `parseUsZip.js` + intake validation (deployed 2026-08-21).
- **List tooling** in `pdf-backend` only; segment repos host creatives + `connectquote.html` shell.

### 2026-08-27 readiness updates

- GUARD WC sandbox E2E on `cid-pdf-api-sandbox`: main-form WC intent, post-quote indication card, NBS/BND, `finalizeGuardBind()` → Connect policy row.
- Prod GUARD credentials and CO class codes **pending Jon** — do not enable on `cid-pdf-api` until confirmed.

### 2026-08-21 readiness updates

- Seven CO ConnectQuote Instantly campaigns; LocalProspects pipeline documented (`localprospects-list-design.md`).
- GUARD WC API routes mounted on Render (`/api/guard/wc/*`).

### 2026-06-04 readiness updates

- **ConnectQuote (Coterie):** planned audit trail documented; production bind still BoldSign-only until webhook + `bind_source` ship.

### 2026-03-26 readiness updates

- **Poller robustness:** ingestion now uses `INBOX + UNREAD`, then enforces `CID token + PDF attachment` criteria before quote ingestion; processed mail is auto-labeled `carrier-quotes`.
- **AI letter continuity:** S5 letter generation has a three-layer fallback (Claude primary, Gemini secondary, deterministic template last resort).
- **Bind signing determinism:** S6 uses a centralized, segment-branded bind-confirmation signing document with fixed placement controls via `BOLDSIGN_BIND_CONFIRMATION_SIGNATURE_*`.
- **Duplicate policy update:** same email may submit different businesses; duplicate suppression keys on business identity (with business+zip fallback when email is absent).
