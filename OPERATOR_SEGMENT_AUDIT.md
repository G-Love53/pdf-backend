# Operator segment filter + S1–S6 audit (pdf-backend)

**Date:** 2026-03-19 (segment filter baseline) · **Update:** 2026-05-06 (S5 client email + deliverability docs)  
**Intent:** One shared backend; routes/services use `segment` from DB — avoid Bar-only SQL in operator UI.

## Implemented (this change)

- **`?segment=all|bar|roofer|plumber|hvac`** on Operator Home, `/api/operator/dashboard`, and `/operator/today/*` (default **all** via `sqlSegmentFilter` + `$1 = 'all'`).
- **Operator Home** dropdown persists selection in the URL (`history.replaceState`) and passes segment to S4/S5/S6 nav links and metric drill-downs.
- **BoldSign redirect** back to `/operator` preserves `segment` when present.
- **Renewals** queue on the dashboard now respects the same segment filter (previously hardcoded to Bar).

## Already segment-aware (no change needed)

| Area | Notes |
|------|--------|
| **S4 API** | `extractionReview.js` — optional `?segment=` on extraction queue. |
| **S5 API** | `packetBuilder.js` — optional `?segment=` on packet queue. |
| **S6 API** | `bindFlow.js` — `listReadyToBind({ segment })` from `?segment=`. |
| **Extraction prompts** | `extractionService.js` — `resolvePromptBuilder` → `bar`, `roofer`, `plumber`, `hvac`. |
| **Gmail poller** | `gmailPoller.js` — `SEGMENTS` lists **bar, roofer, plumber, hvac** inboxes. |
| **Packet / bind services** | Use `submission.segment` / `quote.segment` for copy and paths (not Bar-hardcoded in core queries). |

## Follow-ups (manual / product)

- **S4 detail UI** — `extraction-review.ejs` segment-specific field blocks: verify in UI with real Plumber/Roofer/HVAC quotes after Bar fixes.
- **S5 packet templates** — No `PACKET_TEMPLATES` map in repo; packet build uses shared `createSimplePagePdf` + `reviewed_json`. Add segment-specific HTML/EJS under `CID_HomeBase` or `src/templates/packets/<segment>/` only if product needs different layouts.

## S5 client packet email (2026-05-06 — shared `pdf-backend` path, all segments)

- **HTML body:** Claude-generated sales letter is rendered **in the email body** first; quote summary table and **Issue Policy** / **I Have a Question** actions follow. Combined quote PDF remains **attached** as backup.
- **Plain text:** A **text/plain** MIME part is sent with the same narrative + summary + URLs so clients that strip HTML stay readable.
- **Default subject:** Prospect-facing, **no carrier name** in subject (e.g. `Your HVAC Insurance Quote is Ready`). Operator can still override in S5.
- **Sign-off:** Letter closing uses vertical brand **“{Segment} Insurance Direct”** (Bar / Roofing / Plumber / HVAC), aligned with segment outreach copy.
- **Operator UX:** Use **Preview** then **Refresh email preview** on packet detail after deploy to pull the latest template behavior.
- **S6 bind PDF** — `bindService` builds bind confirmation via `createSimplePagePdf` + `brandLineForBindPdf` / `normalizeSegment`, not per-segment `templates/binds/<segment>/`. Add segment EJS only if legal/copy requires distinct documents.
- **Carrier routing** — Poller maps inbox → segment via `SEGMENTS`; confirm env `GMAIL_REFRESH_TOKEN_*` exists for each inbox on Render.

## Plumber smoke test

1. Set Operator Home to **Plumber** — counts and queues should only show `submissions.segment = plumber`.
2. Open **S4 queue** / **S5** / **S6** from header — URL should carry `?segment=plumber` (or re-select Plumber on each screen).
3. Run one Plumber quote through S4 approve → S5 send → S6 bind and confirm timeline + policy row.
