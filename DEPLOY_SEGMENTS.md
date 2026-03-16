## Deploy Guide — Adding a New Segment to CID-PDF-API

This guide covers what to do when you add a new go‑to‑market segment (e.g. HVAC today, future trades) so that the CID-PDF-API service, S4, and S5 work end‑to‑end.

### 1. Database and enums

1. **Extend `segment_type`** in the central `cid_postgres` migration repo (not this service directly):
   - Add the new segment value to `segment_type` (e.g. `'electrician'`).
   - Redeploy the DB migration.
2. **CID-PDF-API assumes** `segment_type` already includes the new value; there is no additional schema change required here as long as:
   - `submissions.segment`, `carrier_messages.segment`, and `quotes.segment` use the new enum value.

### 2. Poller + routing

1. **Gmail inbox + env vars**
   - Create a `quotes@{segment}insurancedirect.com` inbox.
   - Add a refresh token env var for the new inbox (pattern: `GMAIL_REFRESH_TOKEN_<SEGKEY>`).
2. **Poller configuration**
   - In `src/jobs/gmailPoller.js`, append to `SEGMENTS`:
     - `{ segment: "electrician", email: "quotes@electricianinsurancedirect.com", label: "carrier-quotes" }`.
   - The poller will then:
     - Ingest inbound carrier emails for the new segment.
     - Store PDFs in R2 as `documents` (`carrier_quote_original`).
     - Create `quotes` and `work_queue_items` (`queue_type='extraction_review'`) for S4 automatically.

### 3. Extraction (S4)

1. **Segment prompt**
   - Add a new file: `src/prompts/extraction/<segment>.js` exporting `build<Segment>ExtractionPrompt(pdfBase64)`.
   - Follow the pattern from `bar.js`, `roofer.js`, `plumber.js`, `hvac.js`:
     - Include common fields (carrier_name, policy_type, annual_premium, effective/expiration dates, GL limits, deductible).
     - Include any segment‑specific fields.
     - Return JSON with `{ "extracted_data": {...}, "confidence_scores": {...} }`.
2. **Prompt resolution**
   - Update `resolvePromptBuilder` in `src/services/extractionService.js` to map the new segment string to the new prompt builder.
3. **Operator UI**
   - Update `renderForm` in `src/views/operator/extraction-review.ejs` to add a block of fields for the new segment, following the existing conditional blocks for Bar/Roofer/Plumber/HVAC.

Once those three are in place, S4 will:
- Show the new segment in the queue.
- Call the correct LLM prompt.
- Render the right field set for review.

### 4. Packet builder (S5)

- S5 is **segment‑agnostic by default**:
  - `packetService.buildPacketData` spreads all keys from `reviewed_json`, so any new segment‑specific fields automatically flow into the packet templates.
  - The combined packet PDF is built from:
    - A simple sales‑letter page.
    - A simple summary page built from standard fields.
    - The original carrier quote PDF from R2.
- If you want **segment‑specific S5 copy or layout**:
  - Extend `packetEmailService` with a segment‑specific line for the new segment.
  - Optionally, replace the simple `createSimplePagePdf` pages with proper HTML/EJS templates for the new segment by:
    - Creating templates under `CID_HomeBase` or `src/templates/packets/<segment>/`.
    - Updating `packetService.buildPacket` to render those templates via `generateDocument` instead of using `createSimplePagePdf`.

### 5. Deployment checklist

For each new segment:

1. **Database**: segment enum updated and migration applied in `cid_postgres`.
2. **Gmail**: new quotes inbox live, refresh token added to Render env.
3. **CID-PDF-API code** (this repo):
   - `SEGMENTS` updated in `src/jobs/gmailPoller.js`.
   - New prompt file in `src/prompts/extraction/`.
   - `resolvePromptBuilder` updated.
   - Extraction review form updated for new segment fields (optional but recommended).
   - Optional: S5 email/template tweaks for the new segment.
4. **CID segment landing page + Instantly outreach**:
   - Create or update the Netlify static site for the segment:
     - `Netlify/index.html` uses a segment‑specific creative hero (value props) plus the full accordion intake form underneath.
     - The form integrates Instantly‑style prefill and tracking:
       - URL params: `bn` (business name), `fn`/`ln` (contact name), `em` (email), `ph` (phone), `ad`/`ct`/`st`/`zp` (address), `src` (traffic source), `cid` (campaign id).
       - Hidden fields in the form: `traffic_source` (default `direct`, set from `src`) and `campaign_id` (from `cid`).
       - Prefill logic maps those short params into the top contact/address fields and visually marks them as pre‑loaded (e.g. `prefilled` CSS).
       - When 3+ fields are prefilled, the creative bridge line changes to a “we’ve loaded your info — just confirm and submit” variant.
   - Use `src/outreach/normalize.js` with `--segment <segment>` / `--campaign <tag>` to produce Instantly‑ready CSVs under `data/` (e.g. `instantly-test-<segment>.csv`) whose `prefilledUrl` column points at the correct Netlify landing page.
5. **Deploy**:
   - Commit and push changes to `main`.
   - Wait for Render to redeploy `CID-PDF-API`.
   - Deploy or drag‑and‑drop the updated Netlify sites for the affected segments.
   - Smoke test:
     - Submit a form for the new segment.
     - Reply with a carrier quote PDF.
     - Confirm:
       - S4 queue shows the quote with the new segment.
       - Extraction prompt returns the expected fields.
       - Packet builder (S5) can preview and send a packet.
       - Instantly links land on the new creative + prefilled full form and `/submit-quote` still works end‑to‑end.

