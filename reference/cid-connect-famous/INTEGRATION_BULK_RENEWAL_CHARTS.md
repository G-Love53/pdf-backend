# Bulk quote emails + renewal alerts + Claims charts — paste into Famous

Copy **only** the fenced block below into Famous.

---

```text
Implement three features in CID Connect (admin/staff).

--- 1) BULK EMAIL FROM QUOTE HISTORY ---

- In Admin (or a dedicated admin view), add a way to select **multiple quotes** from **quote history** (checkboxes per row, "Select all on page" optional).
- Primary action: **"Send PDF summaries"** (or similar) that, for each selected quote, calls the **existing `email-quote-pdf` edge function** with `quote_id` and the **insured user's email** (from `profiles` / quote ownership — same resolution as QuoteResults).
- Run sends **sequentially** with a short delay between calls (e.g. 1 second) to avoid rate limits; show progress (N of M) and a summary toast on completion.
- Handle failures per row without aborting the whole batch; log failures if you have webhook_events or audit patterns.
- Only staff/admin; respect RLS.

--- 2) RENEWAL ALERT SYSTEM ---

- SQL: Create `renewal_notifications` table, e.g. columns: id, policy_id (fk policies), user_id, days_before_expiry (30|60|90), channel ('email'), template_key or template_id, status (sent|failed), resend_message_id (nullable), error_message (nullable), created_at. Indexes on policy_id, created_at. RLS for staff/admin read; inserts from service role or edge function.

- Edge function `check-renewals` (scheduled via Supabase cron or external scheduler):
  - Query `policies` where term end / expiration / renewal_date falls in **30, 60, or 90 days** from today (use your actual date columns; document which column is "renewal date").
  - For each policy due for a bucket the user hasn't been notified for recently (dedupe: e.g. unique policy_id + days_before + calendar month), send email via **Resend** using your **email_templates** (or a fixed template) with merge fields (policy number, expiry date, insured name).
  - Insert a row into `renewal_notifications` per send (success/failure).
  - Use **GATEWAY_API_KEY** or service role as appropriate; keep secrets in Edge only.

- Admin: **"Renewal Alerts"** tab showing:
  - Table or list of **upcoming renewals** (policies in the next 90 days) with key columns (policy number, insured, expiry, segment).
  - Sub-section or filter: **sent notifications** from `renewal_notifications` (filters by date, status).

--- 3) CLAIMS TAB — INTERACTIVE CHARTS + FILTERS + CSV ---

- Add **`recharts`** to the project (`npm install recharts` or your package manager).
- On the **Admin Claims** tab (or embedded section), add:
  - **Date range** filter (start/end) applied to all charts and exports.
  - **Pie chart**: claims count **by status** (filtered range on `created_at` or `updated_at` — pick one and document).
  - **Line chart**: claims **over time** (e.g. daily or weekly buckets within the range).
  - **Bar chart**: **settlement_amount** vs **estimated_amount** (aggregated per claim or summed by period — choose a clear UX, e.g. scatter of points or grouped bars for top N claims; label axes).
- **Export**: **"Download CSV"** for the **same filtered claim set** used by the charts (columns at minimum: claim_number, status, created_at, estimated_amount, settlement_amount, segment).
- Use existing `getAllClaims` or a new filtered query; client-side filter by date range if dataset size allows; otherwise add `getClaimsForAdminCharts({ start, end })` in api.ts.

- Loading/empty states; responsive layout.

At the end, list files changed, new SQL migrations, any cron schedule for `check-renewals`, and confirm `recharts` dependency.
```

---

Nothing else in this repo is required to use the above prompt.
