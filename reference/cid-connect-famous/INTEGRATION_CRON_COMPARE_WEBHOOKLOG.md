# Renewal cron + quote comparison + webhook log — paste into Famous

Copy **only** the fenced block below into Famous.

---

```text
Implement three features.

--- 1) DAILY RENEWAL CRON (8:00 AM UTC) + ADMIN TOGGLE ---

- Schedule **check-renewals** to run **daily at 08:00 UTC**.
- Use the mechanism your Supabase project supports:
  - **Option A:** `pg_cron` + **`pg_net`** `net.http_post` (or legacy `http` extension) to POST to `https://<PROJECT_REF>.supabase.co/functions/v1/check-renewals` with headers `Authorization: Bearer <SERVICE_ROLE_KEY>` and `Content-Type: application/json`. Store the service role key in **Supabase Vault** and reference it from SQL if required by your security model — do not hardcode secrets in repo.
  - **Option B:** If pg_cron HTTP is not available, use **Supabase Dashboard → Edge Functions → Schedules** (or documented cron) to invoke the function daily at 08:00 UTC.
- Document the chosen approach in a short comment in SQL or README for operators.

- **Enable/disable automatic runs:** Add a row in a small **`app_settings`** table (key/value) e.g. `renewal_cron_enabled` = `true`/`false`, OR reuse an existing settings pattern. At the start of **check-renewals**, if disabled, exit 200 without sending.

- **Renewals admin tab:** Toggle (switch) bound to that setting (staff/admin only), save via api. Show **“Next scheduled run: daily 08:00 UTC”** (static text) and optionally **last successful run** timestamp if you log it (e.g. insert into `renewal_notifications` meta row or `app_settings` `renewal_last_cron_at`).

--- 2) QUOTE COMPARISON (USER) ---

- **QuoteHistory:** Add **multi-select mode** after user taps **“Compare quotes”** (or similar). Checkboxes on each row; allow **2–3** selections max (disable further selection or show validation).

- **New `QuoteComparison` component** + **MainApp** route (e.g. `quote-comparison` or modal full-screen on mobile):
  - Load full rows for selected quote ids (same fields you need for analysis: carrier, premium, coverage limits for GL/property/auto/umbrella if present in `analysis_json` or columns, deductible, eligibility, AI summary highlights).
  - **Responsive grid:** desktop = side-by-side columns per quote; mobile = stacked cards or horizontal scroll.
  - Table-style rows: **row label** (left) × **one column per quote** with values.
  - **Back** returns to Quote History and clears selection.

- Use existing types / `QuoteAnalysisResult` shape where possible; normalize missing fields as "—".

--- 3) UNIFIED `webhook_events` LOG + ADMIN TAB ---

- **SQL:** Create or **migrate** `webhook_events` to support **both** inbound and outbound:
  - Columns: **id**, **event_type** (text), **direction** (`inbound` | `outbound`), **endpoint** (text), **request_body** (jsonb), **response_status** (int, nullable), **response_body** (jsonb, nullable), **created_at** (timestamptz default now()).
  - If an older `webhook_events` or `inbound_webhook_events` exists, migrate/merge with a clear migration path.
  - **RLS:** authenticated **admin/staff** SELECT only; **INSERT** via service role / edge functions (not from browser for untrusted payloads).

- **Instrumentation:** From **send-notification**, **email-quote-pdf**, **generate-quote-pdf**, **export-admin-overview-pdf**, backend notify fetchers, and **receive-external-webhook** (if any): insert **outbound** or **inbound** rows with sanitized bodies (truncate huge payloads if needed).

- **Admin:** New tab **“Webhook log”** (or under Audit):
  - Recent events, paginated; filters **event_type**, **direction**.
  - Expandable rows for full **request_body** / **response_body** JSON.
  - **Retry** only for **outbound** rows where **response_status** indicates failure and you stored enough to replay (re-invoke edge function with stored request).

At the end, list migrations, cron/SQL or Dashboard schedule steps, and files changed.
```

---

Nothing else in this repo is required for this batch.
