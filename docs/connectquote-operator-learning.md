# ConnectQuote — Operator learning cards (saved spec)

> **Status:** Spec only — build after marketing launch when patterns emerge.  
> **As of:** 2026-07-29 · **Operator today:** [`/operator`](https://cid-pdf-api.onrender.com/operator) (generic S4–S6; partial Coterie signal).  
> **Related:** [`connectquote-shipped-2026-06.md`](./connectquote-shipped-2026-06.md) · [`coterie-integration.md`](./coterie-integration.md)

---

## Plan

1. **Launch marketing** with disciplined `src` + `cid` on every ConnectQuote URL.  
2. **Watch** submissions, binds, and campaigns for 2–4 weeks (Operator Home + ad-hoc SQL below).  
3. **Build Operator Learning cards** when volume makes manual SQL painful or a specific funnel question repeats.

Do not block launch on this UI — data already lands in **`submissions`**, **`timeline_events`**, and **`policies`**.

---

## C&F (clicks & fills) — launch week (marketing starts)

**What you can measure day 1 without new code:**

| Metric | Marketing name | Signal today | How |
|--------|----------------|--------------|-----|
| **Fill + submit** | Fill / conversion | **`submissions`** row | Every successful ConnectQuote POST; filter `quote_rail = coterie` |
| **Attributed fill** | Fill by campaign | `traffic_source` (`src`), `campaign_id` (`cid`) | **Required on every URL** |
| **Quote shown** | Soft conversion | `coterie.bindable_quote` / `coterie.session` timeline | SQL in this doc |
| **Bind** | Purchase | `policies` + `coterie.policy.bound` | Operator Home “Policies bound” |

**What is NOT tracked yet (clicks / opens):**

- Landing on `connectquote.html` without submit → **no server event**
- Partial form abandon → **no beacon**

**Day-1 C&F workaround:**

1. **Clicks (proxy):** Email/ ad platform click counts (Instantly, Meta) + **`src`/`cid`** on destination URL.
2. **Fills:** SQL **Submits** and **Attribution** queries below — run daily during launch week.
3. **Fill rate (rough):** platform clicks → submits with matching `src`/`cid` (not page-level precision).

**URL discipline (non-negotiable):**

```
…/connectquote.html?st=CO&zp=80202&bc=…&src={channel}&cid={campaign-v1}
```

Examples: `src=instantly`, `src=fb`, `src=google`, `src=organic` · `cid=aug-electrical-co-v1`

**v2 (after launch):** page-view ping or GA4 on segment Netlify — see **v2** section below.

---

## What Operator Home does today (ConnectQuote)

| Tile | Useful for CQ? | Caveat |
|------|----------------|--------|
| Submissions (today) | Yes | Counts **POST submit**, not page open |
| Policies bound (today) | Yes | Coterie + traditional combined |
| Binds initiated (today) | Yes | Coterie instant binds count |
| Connect policy/dec PDFs | Yes | After Coterie webhook ingest |
| Approved quotes (S4) | Weak | Coterie extraction row created **at bind**, not at quote |
| Packets sent (S5) | No | Coterie uses `quote_packets.status = approved`, not `sent` |
| Connect bind PDF stored | No | BoldSign `signed_bind_docs` only |
| Waiting for carrier outreach | Misleading | Pre-bind CQ subs listed with ConnectQuote pill; use **Recent ConnectQuote submissions** for Coterie rail |

---

## Learning dimensions (train internal + external)

### External (campaign / insured behavior)

| Metric | Question | Tracked today? |
|--------|----------|----------------|
| Page opens | How many landed on `connectquote.html`? | **No** — needs GA4 or light view ping (v2) |
| Prefill vs cold | Instantly/email prefill vs organic URL? | **Partial** — only on submit via `src`/`cid` |
| Open → submit | Fill rate | **No** (need opens + submits) |
| Submit → quote | Got bindable premium? | Yes — `coterie.bindable_quote`, `coterie.session` |
| Quote → bind | Conversion after seeing price | Yes — compare timeline to `coterie.policy.bound` |
| Traditional redirect | Owner gate, knockouts, appetite | Yes — `coterie.rail_traditional`, `coterie.appetite_excluded` |

### Internal (ops / product)

| Metric | Question | Tracked today? |
|--------|----------|----------------|
| Quotes delivered | How many bindable quotes returned? | Yes — timeline |
| Bind vs no-bind | Who saw price but didn’t pay? | Yes — SQL below |
| Bind timing | Instant (same session) vs delayed? | Yes — `submitted_at` → `bound_at` |
| Repeat customer quotes | Same email, multiple subs (price shop)? | Yes — `clients` → many `submissions` |
| Field changes | Re-quote with different sales/payroll/class? | Partial — diff `raw_submission_json` |
| Attribution | Which `src` / `cid` converts? | Yes — stored on submit, not aggregated in UI |
| Docs ingest lag | Minutes from bind to PDF in vault? | Yes — `coterie.policy.bound` vs `coterie.policy.docs_ingested` |

### Marketing discipline (required now)

Every campaign URL should include:

```
…/connectquote.html?st=CO&zp=…&bc=…&src={channel}&cid={campaign-slug}
```

Examples: `src=instantly`, `src=fb`, `src=organic` · `cid=july-hvac-co-v1`

Stored in `submissions.raw_submission_json` as `traffic_source` and `campaign_id`.

---

## Proposed Operator Learning cards (v1 — build when ready)

Add a section on **`/operator/home`** (below today KPIs or new tab **ConnectQuote → Learning**).

Default filter: UTC day + optional `?segment=` (same as existing dashboard).

### Card A — Funnel (7 / 30 days)

| Tile | Definition |
|------|------------|
| **Submits** | `submissions` where `quote_rail = coterie` |
| **Quoted** | Distinct subs with `coterie.bindable_quote` or `coterie.session` |
| **Bound** | Distinct subs with `coterie.policy.bound` or `policies.bind_source = coterie` |
| **Quote rate** | Quoted ÷ Submits |
| **Bind rate** | Bound ÷ Quoted |
| **Traditional exits** | Count `coterie.rail_traditional` + `coterie.appetite_excluded` |

Drill-down: list `submission_public_id`, segment, email (masked), timestamps.

### Card B — Bind timing

| Tile | Definition |
|------|------------|
| **Median minutes to bind** | `bound_at - submitted_at` for coterie policies |
| **Instant (&lt; 15 min)** | Same-session binds |
| **Delayed (&gt; 24 h)** | Returned later |
| **No bind (quoted)** | Quoted subs with no policy row |

### Card C — Repeat customers

| Tile | Definition |
|------|------------|
| **Customers with 2+ subs** | Same `client_id` / email in window |
| **Top repeat emails** | Ops follow-up list (role-gated) |
| **Avg subs per repeat customer** | Price-shopping signal |

### Card D — Attribution

| Table row | Columns |
|-----------|---------|
| By campaign | `src`, `cid`, segment, submits, quoted, bound, bind rate |

### Card E — Segment health

| Row | electrical, fitness, hvac, plumber |
|-----|-------------------------------------|
| Submits / quoted / bound / bind rate | Per segment |
| Top exit reasons | `rail_traditional` reason, appetite excluded |

### Card F — Docs pipeline (optional)

| Tile | Definition |
|------|------------|
| **Bound, no docs yet** | Policy exists, no `coterie.policy.docs_ingested` within N hours |
| **Docs ingested** | Webhook success count |

---

## v2 (after v1 proves value)

| Feature | Why |
|---------|-----|
| **Page view ping** | `POST /api/coterie/intake-view` or GA4 on segment Netlify — true open → submit rate |
| **Partial progress events** | Optional client beacons: `business_class_selected`, `quote_shown`, `payment_started` |
| **Exclude internal** | Filter `src=demo`, test emails from marketing KPIs |
| **Export CSV** | Weekly partner report |

---

## Ad-hoc SQL (use until cards ship)

Run against Render **External** Postgres (`cid_postgres`). Filter dates as needed.

### Bind rate by segment (7 days)

```sql
SELECT s.segment,
       COUNT(DISTINCT s.submission_id) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM timeline_events te
           WHERE te.submission_id = s.submission_id
             AND te.event_type IN ('coterie.bindable_quote', 'coterie.session')
         )
       ) AS quoted,
       COUNT(DISTINCT p.submission_id) AS bound
FROM submissions s
LEFT JOIN policies p ON p.submission_id = s.submission_id
  AND p.coverage_data->>'bind_source' = 'coterie'
WHERE s.raw_submission_json->>'quote_rail' = 'coterie'
  AND s.submitted_at > NOW() - INTERVAL '7 days'
GROUP BY s.segment
ORDER BY s.segment;
```

### Minutes from submit to bind

```sql
SELECT s.submission_public_id,
       s.segment,
       s.submitted_at,
       p.bound_at,
       ROUND(EXTRACT(EPOCH FROM (p.bound_at - s.submitted_at)) / 60.0, 1) AS minutes_to_bind
FROM policies p
JOIN submissions s ON s.submission_id = p.submission_id
WHERE p.coverage_data->>'bind_source' = 'coterie'
ORDER BY p.bound_at DESC
LIMIT 50;
```

### Repeat quotes, same customer

```sql
SELECT c.primary_email,
       COUNT(*) AS submission_count,
       MIN(s.submitted_at) AS first_sub,
       MAX(s.submitted_at) AS last_sub
FROM submissions s
JOIN clients c ON c.client_id = s.client_id
WHERE s.raw_submission_json->>'quote_rail' = 'coterie'
GROUP BY c.primary_email
HAVING COUNT(*) > 1
ORDER BY submission_count DESC;
```

### Attribution (`src` / `cid`)

```sql
SELECT s.raw_submission_json->>'traffic_source' AS src,
       s.raw_submission_json->>'campaign_id' AS cid,
       s.segment,
       COUNT(*) AS submits,
       COUNT(p.id) AS binds
FROM submissions s
LEFT JOIN policies p ON p.submission_id = s.submission_id
WHERE s.raw_submission_json->>'quote_rail' = 'coterie'
  AND s.submitted_at > NOW() - INTERVAL '30 days'
GROUP BY 1, 2, 3
ORDER BY submits DESC;
```

### Quoted, no bind (follow-up list)

```sql
SELECT s.submission_public_id,
       s.segment,
       s.submitted_at,
       s.raw_submission_json->>'traffic_source' AS src,
       s.raw_submission_json->>'campaign_id' AS cid
FROM submissions s
WHERE s.raw_submission_json->>'quote_rail' = 'coterie'
  AND EXISTS (
    SELECT 1 FROM timeline_events te
    WHERE te.submission_id = s.submission_id
      AND te.event_type IN ('coterie.bindable_quote', 'coterie.session')
  )
  AND NOT EXISTS (
    SELECT 1 FROM policies p WHERE p.submission_id = s.submission_id
  )
ORDER BY s.submitted_at DESC;
```

### Traditional / appetite exits

```sql
SELECT te.event_type,
       te.event_payload_json->>'reason' AS reason,
       COUNT(*) AS n
FROM timeline_events te
JOIN submissions s ON s.submission_id = te.submission_id
WHERE te.event_type IN ('coterie.rail_traditional', 'coterie.appetite_excluded')
  AND s.submitted_at > NOW() - INTERVAL '30 days'
GROUP BY 1, 2
ORDER BY n DESC;
```

---

## Timeline events reference

| `event_type` | Meaning |
|--------------|---------|
| `submission.received` | Form POST recorded |
| `coterie.rail_traditional` | Routed off instant rail (owner gate, etc.) |
| `coterie.appetite_excluded` | Coterie / UW declination |
| `coterie.application_created` | Coterie application API OK |
| `coterie.bindable_quote` | Bindable premium returned |
| `coterie.bindable_blocked` | E0122 producer license, etc. |
| `coterie.session` | Quote persisted for bind step |
| `coterie.policy.bound` | Instant bind finalized |
| `coterie.policy.docs_ingested` | Webhook PDF ingest complete |

**Tables:** `submissions`, `clients`, `policies`, `timeline_events`, `quotes` (Coterie quote row at bind).

**Code paths:** `coterieIntakeService.js`, `coteriePipelineService.js`, `coterieDocIngestService.js`, `operatorRoutes.js`.

---

## Build checklist (when implementing v1)

- [x] ConnectQuote learning on **`/operator/home`** — funnel, revenue, quoted-not-bound + binds tables (`connectQuoteLearningService.js`, 2026-08-01)
- [x] **Recent ConnectQuote submissions** table — all CQ rows in window with status (submitted / in Coterie / quoted / bound), CID as Coterie external ID, Coterie `applicationId` from timeline (2026-06)
- [x] **Unified Operator window** — single header control (`Today`, `7`, `14`, `30` days) drives top KPI cards, ConnectQuote funnel/tables, and drill-down lists (`operatorWindow.js`, 2026-06). Work queues stay open-backlog (no time filter).
- [x] CQ submits (today UTC) metric + dashboard error banner when API fails
- [x] Exclude `src=demo` / partner-demo from marketing KPIs
- [x] Fix “waiting for carrier outreach” to exclude ConnectQuote with bindable timeline
- [x] Requote tracking — same `submission_public_id` on repeat Get quote + `coterie.bindable_quote` count
- [ ] `GET /api/operator/connectquote-learning` standalone endpoint (optional — bundled in dashboard)
- [ ] Optional: link each row to submission detail + timeline viewer

---

## Owner-only marketing reminder (contractor segments)

Electrical, HVAC, Plumber ConnectQuote = **business owners / operators** only. Fitness is not owner-gated. See launch audit in team notes — plumber appetite knockouts include GC / paper contractor and &gt;50% subcontract cost.
