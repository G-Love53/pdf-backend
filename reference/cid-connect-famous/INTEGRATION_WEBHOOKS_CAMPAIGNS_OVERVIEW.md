# Webhooks + Campaigns + Realtime Overview — one paste for Famous

Copy **only** the fenced block below into Famous.

---

```text
Implement the following three areas. If the Admin Overview tab already has realtime metrics from a prior change, skip section C only.

--- A) WEBHOOK EVENTS ---

1) SQL: Create table `public.webhook_events` with at least:
   id (uuid pk), event_type (text: 'email' | 'api'), channel (text, nullable), target_function (text: edge function name to replay, e.g. send-notification), request_body (jsonb), status (text: pending | success | failed), response_body (text, nullable), http_status (int, nullable), error_message (text, nullable), retry_count (int default 0), max_retries (int default 5), created_at, updated_at.
   RLS: staff/admin read/write only (match your existing admin pattern).

2) Logging: Whenever the app or edge functions perform an outbound email or API notify, insert/update `webhook_events` (status, response, retry_count). At minimum, extend `send-notification` (and any other outbound edge callers you use) to write a row on success/failure with enough `request_body` + `target_function` to retry.

3) Admin: New sub-tab "Webhooks" with:
   - Table of recent events, paginated
   - Filters: event_type (email/api), status (success/failed/pending)
   - Retry button for failed rows: calls `retryWebhookEvent(id)` which re-invokes `supabase.functions.invoke(target_function, { body: request_body })` with gateway header, then updates row

4) api.ts: `getWebhookEvents({ limit, offset, event_type?, status? })` returning rows + total count; `retryWebhookEvent(id)`.

--- B) BULK EMAIL CAMPAIGNS ---

1) SQL: Create `public.campaigns` with:
   id, name, template_id (uuid FK to email_templates), recipient_filter (jsonb), status (draft | sending | completed | failed), sent_count, failed_count, total_recipients (int), created_at, updated_at.
   RLS: admin/staff (match templates policies).

2) Email Templates tab: Add "Campaigns" section:
   - Create campaign: name, pick template, define recipient_filter (by role, segment, policy status — use JSON your queries understand)
   - Preview: show recipient COUNT only (query profiles/policies accordingly)
   - Send: resolve recipient emails, then sequentially call `send-notification` (or your mail path) once per recipient with **1 second delay** between sends (rate limit). Update sent_count/failed_count after each; set campaign status when done.
   - History: list past campaigns with sent/failed counts

3) api.ts: list/create/update campaigns; helper to count recipients from filter; `runCampaignSend` or equivalent (client or edge — if list is large, note that background job is better).

--- C) REALTIME ADMIN OVERVIEW ---

1) Replace static Overview stats with live dashboard:
   - Supabase Realtime: subscribe to postgres_changes on `claims`, `coi_requests`, `policies` (enable Replication for these tables in Dashboard).
   - On change, refresh "Today's Summary" and sparklines and activity feed.

2) Today's Summary card — four numbers (same calendar day, consistent timezone):
   - Claims filed today (claims.created_at)
   - COIs completed today (coi_requests where status = completed and relevant timestamp today)
   - Policies bound today (policies.created_at or bound_at)
   - Emails sent today: count from `admin_audit_log` with a filter that matches how you log emails (e.g. action ILIKE '%email%' or dedicated action); align with your schema

3) Sparklines: inline SVG only, ~80×24, 7-day daily trend for claims / COI completions / policies bound (three sparklines). Query per-day counts for last 7 days.

4) Activity feed: last 20 events across types (union recent claims, coi_requests, policies, optionally audit rows), newest first, label + reference + relative time. Refetch on Realtime and every 60s backup.

5) Loading/empty states. Wire into existing Admin Overview tab.

At the end, list files changed and SQL/Realtime steps the operator must verify.
```

---

That is the full request set. No other markdown file is required for this batch.
