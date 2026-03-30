# Overview segment breakdown + inbound webhooks + dashboard PDF — paste into Famous

Copy **only** the fenced block below into Famous.

---

```text
Implement three features.

--- 1) SEGMENT BREAKDOWN IN AdminOverviewLive ---

- Add a **"Segment breakdown"** section below the existing summary/sparklines/feed (or a logical place in the layout).
- Call existing **`getAllPolicies()`** and **`getAllClaims()`** (or equivalent admin APIs already in api.ts). Group rows by **`segment`** (normalize to lowercase for grouping).
- Show **two sub-blocks** (or side-by-side): **Policies by segment** and **Claims by segment** — each as a row of **badges** or small cards: segment label (bar, plumber, roofer, etc.) + **count**, with distinct colors per segment (reuse palette from your old static overview if you still have it in git/history).
- Handle null/empty segment as "Unspecified" or "Other".
- Loading/empty states consistent with the rest of AdminOverviewLive.

--- 2) INBOUND WEBHOOK EDGE FUNCTION + AUDIT SUB-SECTION ---

- If you **already** have a `webhook_events` table used for **outbound** delivery logs, do **not** overwrite it. Instead create **`inbound_webhook_events`** (or add a `direction` column and migrate) — pick one approach and document it.
- New table columns (if new table): **id**, **source** (text, e.g. carrier name or "stripe"), **event_type** (text), **payload** (jsonb), **created_at** (timestamptz default now()). RLS: **no public insert from anon**; **service role** or **edge function** only for inserts. Staff/admin **SELECT** for Audit UI.

- New Edge Function **`receive-external-webhook`** (or similar):
  - **POST** only. Validate a shared secret: **`X-Webhook-Secret`** header or **`Authorization: Bearer <WEBHOOK_INGEST_SECRET>`** matching a Supabase secret (document secret name).
  - Parse JSON body; insert row into the inbound table with **source** (from header or body field), **event_type**, **payload**.
  - Return **200** + `{ ok: true }` on success; **401** if secret wrong; **400** on bad JSON.

- Admin **Audit** tab: add a **"Webhooks"** sub-section (collapsible or second table) listing the **50 most recent** inbound rows: time, source, event_type, truncated payload preview (expand or modal for full JSON).

- Optional: **`getInboundWebhookEvents(limit, offset)`** in api.ts for pagination.

--- 3) EXPORT DASHBOARD REPORT (PDF) ---

- New Edge Function **`export-admin-overview-pdf`** (or reuse a generic **`generate-pdf`** pattern):
  - **Auth**: same as other protected functions (**x-gateway-key** + **GATEWAY_API_KEY**, or verify JWT for staff — match your standard).
  - **Input** (POST JSON): either nothing (server fetches fresh counts) OR pass precomputed numbers from client to avoid double-fetch — prefer **server-side** fetch using **service role** for: today's counts (same logic as `getOverviewTodayCounts`), 7-day trend aggregates (same as sparkline data), and **last 20** activity feed items.
  - Build PDF with **pdf-lib** (same stack as **generate-quote-pdf**): cover line **Report date**, section **Today's metrics** (all four numbers), section **7-day trends** (simple table: date, claims, coi completed, policies), section **Recent activity** (table: time, type, reference, summary).
  - Return **{ base64, filename }** JSON like generate-quote-pdf.

- **api.ts**: **`downloadAdminOverviewPdf()`** — `functions.invoke('export-admin-overview-pdf', …)` then decode base64 and trigger browser download.

- **AdminOverviewLive**: button **"Export dashboard report"** with loading state; call **`downloadAdminOverviewPdf()`**.

At the end, list files changed, new SQL, new secrets (**WEBHOOK_INGEST_SECRET** if used), and deploy notes for the new edge functions.
```

---

Nothing else in this repo is required for this batch.
