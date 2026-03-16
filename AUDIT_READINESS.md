## CID-PDF-API — Audit Readiness (S4/S5)

### What is auditable now

- **Client + submission identity**
  - `clients`: immutable `client_id`, primary email, basic PII.
  - `submissions`: `submission_public_id` (CID‑SEG‑YYYYMMDD‑XXXXXX), original `raw_submission_json` (never mutated), `segment`, `source_domain`, and status history.
- **Carrier correspondence**
  - `carrier_messages`: raw inbound/outbound carrier emails with headers, body, and Gmail IDs.
  - `documents` with `document_role='carrier_quote_original'`: canonical pointer to the exact PDF received from the carrier (hash + R2 path).
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
      - `quote.received` (poller ingestion).
      - `extraction.reviewed` / `extraction.skipped` (S4).
      - `packet.previewed` / `packet.sent` / `packet.resent` (S5).

### How to reconstruct “what the client saw”

Given a `submission_public_id` or `quote_id`:

1. Use `submissions` to resolve `submission_id` and segment.
2. From `quotes`, find the relevant `quote_id` and carrier(s).
3. From `quote_packets`, locate the `packet_id` and `packet_document_id` that was `sent`.
4. From `documents`, fetch:
   - `quote_packet_sent` (combined packet actually sent).
   - `sales_letter_generated` (if needed for comparison).
   - `carrier_quote_original` (what the carrier provided).
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

