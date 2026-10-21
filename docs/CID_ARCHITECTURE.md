## CID-PDF-API — CID Architecture Notes (S1-S6)

> **Canonical location:** `CID-docs/CID_ARCHITECTURE.md` outside segment repos. This local file is a synced copy.

## Core Architecture Rule (Locked)

- `pdf-backend` (Render service: `CID-PDF-API`) is the **single backend** for:
  - Operator UI and dashboard
  - S4 extraction review
  - S5 packet builder
  - S6 bind flow, webhooks, policy creation
  - Gmail poller and quote ingestion
- Segment repos (`plumber-pdf-backend`, `roofing-pdf-backend`, `hvac-pdf-backend`) are intake/static wrappers only.

## End-to-End Flow

1. **Capture (S1-S3)**  
   Netlify intake posts to `/submit-quote` with `bundle_id`, `segment`, and `formData`.
2. **Submit / Persist**  
   API writes `clients`, `submissions`, `timeline_events`; generates ACORD/SUPP PDFs and `CLIENT_SUBMISSION` ("questions answered") PDF.
3. **Carrier outreach**  
   Outbound subject must include bracketed CID token (`[CID-SEG-YYYYMMDD-######]`).
4. **Carrier reply ingestion (poller)**  
   Poller scans `INBOX + UNREAD`, processes only mail with **CID token + PDF attachment**, writes `carrier_messages/documents/quotes/work_queue_items`, auto-labels `carrier-quotes`.
5. **S4 extraction review**  
   Queue items in `work_queue_items` (`extraction_review`) flow through review/approve/dismiss.
6. **S5 packet build**  
   Packet combines sales letter + summary + carrier quote and sends to client.
7. **S6 bind**  
   BoldSign bind request is created; signed file finalization creates `policies`.

### ConnectQuote rail (Coterie API — CO prod)

Parallel **instant** path for eligible SMB risks (**CO bind**: Electrical, Fitness, HVAC, Plumber, Beauty, Cleaning, Pet, Painter). Does not replace steps 3–6 for traditional email-carrier flow. Bar and roofer stay long-form. `COTERIE_PILOT_STATES` stays `CO`.

1. Segment `connectquote.html` (campaign URL prefill — **`parseUsZip` + email validation**, name optional until bind) → business class → **`AKHash`**
2. CID-PDF-API → Coterie `POST /v1.6/commercial/applications` then `POST /v1.6/commercial/quotes/bindable`
3. Insured bind/pay via Coterie/Stripe
4. `POST /webhooks/coterie` → same **`policies`** outcome as BoldSign finalize (S6-lite; `bind_source: coterie`)
5. Connect onboarding via existing welcome/bind email path

Shared intake: `/static/connectquote-intake.js` on Render. Lists: **`pull-localprospects-instantly.mjs`** / **`clean-localprospects-instantly.mjs`**. Spec: [`coterie-integration.md`](./coterie-integration.md), [`outreach-claude-playbook.md`](./outreach-claude-playbook.md).

**Partner Layer (distribution):** trade org / supplier / payroll gets a unique ConnectQuote URL (`ch=partner-{id}` + optional logo). Same quote → bind → Connect path. CID remains agency of record. Internal: [`partner-layer.md`](./partner-layer.md). Sendable: [`partner-layer-onboarding.md`](./partner-layer-onboarding.md).

### ConnectQuote second line (GUARD WC — live)

Workers’ Comp **alongside** Coterie BOP/GL — same `submission_public_id`; main-form WC opt-in → commercial quote → WC indication/bind. **Live on production `cid-pdf-api` for Colorado** beauty, cleaning, pet, fitness, plumber, and electrical. Prod `GUARD_ENABLED_SEGMENTS` is that list. Do not clear it. HVAC class `5537` is off. Painter, bar, and roofer are not in the registry. CID-PDF-API **`/api/guard/wc/*`**. GUARD **direct bill** (CID not merchant of record). `GUARD_CAPITA_PAY_URL` stays unset. Bind → `finalizeGuardBind()` → its own **`policies`** row (`5d88d50`). It does not wait for a Coterie BOP. Carrier PDF: `POST /webhooks/guard-docs` (`25b97d0`). `GUARD_PILOT_STATES` stays `CO`. Spec: [`guard-integration.md`](./guard-integration.md).

### Ready to bind, not bound

When a ConnectQuote customer leaves a bindable price unbound, CID-PDF-API emails the address on the application. This is not Instantly, and it is not the S5 packet. The email is the handout. There is no PDF attachment.

1. **Who.** ConnectQuote segments only. Bar and roofer are skipped. Coterie: a business-policy price (Business Owners Policy or General Liability) that is not bound. GUARD: a full quote (`NBS`) that is instant-bindable and not bound. An indication (`NBQ`) is not a line. A workers’ comp policy that already bound is not a line. One email lists every coverage that is still open. If one coverage binds, later notes list only the open line. No address on the quote means no email.
2. **When.** The first note waits one hour after the last bindable price, and it is not sent if that price is more than seven days old. Binding during that hour sends nothing. One reminder goes the next day, and one on day three, measured from the first note. A last note goes only when the carrier returned a real valid-through date, in the three days before that date. A date is not invented. There is no note a week later.
3. **The link.** One link per submission: `https://cid-pdf-api.onrender.com/q/{token}`. **FINISH AND BIND** opens that page. Opening it does not bind and does not call the carrier. The page does not reprice. If the start date has passed, the page says so. A 6-digit code, emailed to the address already on the quote, lasts 15 minutes. The code is not in the quote email. Only the hash is stored. A correct code confirms that page for 30 minutes.
4. **The words.** Subject: `Your quote for {business} — one step left`. Coverage and price only. No carrier names. From and reply-to `support@commercialinsurance-direct.com`. License line: Insurance offered through All Access Insurance LLC dba CID Insurance Services · CO License #6784587. The next sentence says Commercial Insurance Direct, Inc. is a technology platform and is not an insurer.

The check runs every 15 minutes on CID-PDF-API. Code: `src/services/readyToBindLeaveBehind.js`, `src/services/readyToBindJob.js`, `src/routes/readyToBindRoutes.js`. Runtime and env: [`Deploy_Guide.md`](./Deploy_Guide.md). Trail: [`AUDIT_READINESS.md`](./AUDIT_READINESS.md).

### Next carrier

A new carrier is a new adapter in **pdf-backend** on this same intake and Connect spine. Segment repos stay Netlify intake. The checklist is the **New carrier** lane in [`agent-start.md`](./agent-start.md). GUARD workers’ comp is the worked example: six gates, own `policies` row, carrier PDF ingest, carrier paper for the COI, state expansion by pilot list plus one smoke. Gerry sends the partner email.

## Current Production Invariants

- **Duplicate intake logic (updated):**
  - Same email alone is **not** duplicate.
  - Duplicate requires matching business identity (and zip when present), or business+zip fallback when email missing.
- **AI sales letter (S5):**
  - Primary: Claude (`ANTHROPIC_API_KEY`)
  - Fallback: Gemini (`GEMINI_API_KEY`)
  - Last resort: deterministic template letter
- **Bind signing document (S6):**
  - Signs a centralized, segment-branded bind-confirmation PDF template
  - Stable signature placement via `signature_template=bind_confirmation_v1`
  - Placement env overrides: `BOLDSIGN_BIND_CONFIRMATION_SIGNATURE_X/Y/WIDTH/HEIGHT`

## Operator Surfaces

- `/operator` (home + segment switcher + today drilldowns)
- `/operator/funnel` — **Click → Bind** scoreboard (graphs, stopped-before-quote, channel / partner attribution, mint URL)
- `/operator/extraction-review` (S4 queue/detail, includes dismiss)
- `/operator/packet-builder` (S5 queue/detail)
- `/operator/bind` (S6 queue/detail)
- `/operator/search` — client lookup

## Persistence Spine

- `submissions` (`submission_public_id`)
- `carrier_messages`
- `quotes`, `quote_extractions`, `quote_packets`
- `documents` (R2-backed originals and generated artifacts)
- `work_queue_items`
- `bind_requests`, `policies`
- `timeline_events`, `signature_events`

## Policyholder app (LEG 3) — CID Connect

- **Product name:** **CID Connect** (mobile/web via Famous.ai; see [CID_CONNECT.md](./CID_CONNECT.md)).
- **Execution** remains on **CID-PDF-API**; the app is a **client** of the same APIs and tracking model (`submission_public_id`), not a second backend.

---

### 2026-06-04

- **ConnectQuote (Coterie):** dual rail documented; see `coterie-integration.md`. Traditional S1–S6 unchanged.
