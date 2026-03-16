## CID-PDF-API — CID Architecture Notes (S4/S5)

### High-level flow

- **Intake (S1–S3)**:
  - `/submit-quote` upserts `clients`, inserts `submissions`, sends carrier outreach with `[CID-SEG-YYYYMMDD-XXXXXX]` in subject.
  - `src/jobs/gmailPoller.js` polls `quotes@{segment}insurancedirect.com`, stores inbound carrier emails in `carrier_messages`, PDFs in R2 (`documents` with `document_role='carrier_quote_original'`), creates `quotes`, and routes work to `work_queue_items`.
- **S4 Extraction Review**:
  - Queue: `work_queue_items` with `queue_type='extraction_review'`, `related_entity_type='quote'`.
  - API: `src/routes/extractionReview.js` (`/api/queue/extraction-review*`).
  - Service: `src/services/extractionService.js` calls Anthropic with segment‑specific prompts in `src/prompts/extraction/*.js`, writes `quote_extractions` (`reviewed_json`, `is_active=true`), and logs `timeline_events` (`extraction.reviewed`, `extraction.skipped`).
- **S5 Packet Builder**:
  - Queue: quotes with an active, approved extraction (`quote_extractions.is_active=true`, `review_status='approved'`), surfaced via `/api/quotes/ready-for-packet`.
  - Service: `src/services/packetService.js` and `src/services/pdfCombineService.js` build a combined packet PDF (sales‑letter page, summary page, carrier quote) and persist it to R2 + `documents` (`sales_letter_generated`, `quote_packet_sent`) and `quote_packets`.
  - Email: `src/services/packetEmailService.js` composes segment‑aware client emails and sends via `sendWithGmail` (Gmail SMTP).
  - Timeline: `timeline_events` entries for `packet.previewed`, `packet.sent`, `packet.resent`.

### Operator UI surfaces

- All operator screens are rendered by `src/views/operator/*` and mounted in `src/routes/operatorRoutes.js`:
  - **S4**: `/operator/extraction-review` (queue) and `/operator/extraction-review/:workQueueItemId` (split‑pane PDF + extraction form).
  - **S5**: `/operator/packet-builder` (grouped by `submission_public_id` for multi‑carrier comparison) and `/operator/packet-builder/:quoteId` (PDF preview + send form).

### Persistence model for packets

- **quote_extractions**:
  - Multiple versions per quote; `reviewed_json` is the only source of truth for packet generation.
  - Application logic + trigger enforce a single active version (`is_active=true`) per quote.
- **documents**:
  - Carrier quote originals: `document_role='carrier_quote_original'`, `is_original=true`, written by the Gmail poller.
  - Packet artifacts:
    - `document_role='sales_letter_generated'` — sales‑letter PDF.
    - `document_role='quote_packet_sent'` — combined packet PDF sent to the client.
  - All documents are stored in R2 via `storage_provider='r2'` and `storage_path` and are only accessed via pre‑signed URLs or internal tools.
- **quote_packets**:
  - Links a `quote` + a specific `quote_extractions` version (`extraction_id`) + the packet `documents.document_id`.
  - Status lifecycle is designed for S6+ (bind) to hook into: `sent` now, with `viewed`/`accepted`/`bound` pre‑wired at the schema and code level.

