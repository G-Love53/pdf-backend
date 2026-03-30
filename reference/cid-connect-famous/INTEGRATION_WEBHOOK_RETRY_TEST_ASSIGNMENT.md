# Webhook retry queue + Test Webhook UI + claim assignment — paste into Famous

**Status:** **Implemented in Famous** (retry queue + **`process-retry-queue`**, Test Webhook on **WebhookRulesTab**, **`claims` assignment** + **AdminClaimAssignments**, canonical **`webhook_rule_execution`** / **`rule_execution`**). See **`FAMOUS_HANDOFF_RESPONSES.md`**. Keep this file as the original spec.

Copy **only** the fenced block below into Famous **for a fresh project or regression**. **Famous is source of truth** for deployed code.

---

```text
Implement the following four areas in CID Connect (Supabase + admin UI).

================================================================================
0) OUTBOUND NAMING ALIGNMENT (do this first)
================================================================================

Today’s risk: mixed strings like `rule-execution` vs `webhook_rule_execution` for
rule run logs in `webhook_events`, and `source` values that differ from what the
admin **Webhooks** tab filters on.

- Pick **one canonical** `event_type` for “a webhook rule action ran” (recommend:
  **`webhook_rule_execution`**).
- Pick **one canonical pattern** for `source` on those rows (e.g. fixed
  **`rule_execution`** OR `rule_execution:<rule_id>`—document which).
- Update in **one place**: `receive-external-webhook` (outbound inserts), admin
  **Webhooks** / **Alerts** queries, **E2E** docs, and any indexes that key off
  `event_type` / `source`.
- Ensure filters in the Webhooks tab use these same values so staff see all rule
  execution rows consistently.

================================================================================
1) RETRY QUEUE FOR FAILED OUTBOUND (send-notification 429 / 5xx)
================================================================================

Goal: do not lose outbound email when Resend returns **429** or **5xx** (and
similar transient failures).

**SQL — new table `retry_queue`** (public schema, RLS staff/admin only or
service role only + SELECT for staff):

- `id` uuid PK default gen_random_uuid()
- `webhook_event_id` uuid NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE
  (or SET NULL if you prefer to retain queue rows—choose and document)
- `retry_count` int NOT NULL default 0
- `max_retries` int NOT NULL default 3
- `next_retry_at` timestamptz NOT NULL
- `status` text NOT NULL default 'pending'
  — use a small set: `pending` | `processing` | `succeeded` | `failed` | `cancelled`
- `last_error` text nullable
- `target_function` text NOT NULL default 'send-notification' (future-proof)
- `created_at` / `updated_at` timestamptz defaults

Indexes: `(status, next_retry_at)` where status = 'pending'; optional unique
partial on `webhook_event_id` where status = 'pending' to avoid duplicates.

**send-notification edge function:**

- On **429** or **5xx** (and optionally other retriable errors), after logging the
  outbound `webhook_events` row, **enqueue** a `retry_queue` row:
  `next_retry_at = now() + interval '1 minute'` (or exponential backoff:
  1m, 5m, 15m).
- On success (2xx from Resend), do not enqueue.
- Do **not** enqueue for logical 400s (bad body) unless you explicitly want to.

**New edge function `process-retry-queue`:**

- Auth: **service role** only via **pg_cron** calling the function URL with
  `Authorization: Bearer <service_role>` (same pattern as `check-renewals`),
  **or** verify `x-internal-secret` / Vault reference—do not expose to anon.
- Every run:
  1. Select a batch of rows: `status = 'pending'` AND `next_retry_at <= now()`
     AND `retry_count < max_retries` FOR UPDATE SKIP LOCKED (or equivalent).
  2. Mark row `processing`, increment `retry_count`, re-invoke **stored
     request** from the linked `webhook_events.request_body` (or copy payload
     snapshot at enqueue time if FK deletes lose data—document choice).
  3. On success: mark `succeeded`, update original `webhook_events` row if useful.
  4. On failure: if `retry_count >= max_retries` mark `failed` and set
     `last_error`; else set `next_retry_at` with backoff and `pending`.
- Log outcomes (optional outbound `webhook_events` for `retry_processor`).

**pg_cron:** schedule **`process-retry-queue`** every **5 minutes**
(`*/5 * * * *` UTC) via migration + `pg_net`, **or** Dashboard schedule if
available. Document in `app_settings` (e.g. `retry_cron_approach`).

**Admin Webhooks tab:**

- Section **Pending retries**: table of `retry_queue` (filter pending/failed),
  show `webhook_event_id`, `retry_count`, `next_retry_at`, `last_error`.
- **Manual retry** button: set `next_retry_at = now()`, `status = 'pending'`
  (admin-only API or edge).

**api.ts:** `getRetryQueueRows`, `retryRetryQueueNow(id)`, etc., staff only.

================================================================================
2) “TEST WEBHOOK” PANEL (WebhookRulesTab)
================================================================================

Goal: smoke-test **`receive-external-webhook`** without `curl`.

On **WebhookRulesTab** add **Test Webhook**:

- **JSON editor** for full POST body (default template: `{ "source": "...", "event_type": "...", "payload": {} }`).
- **Dropdowns** for `event_type` and `source` **pre-filled** from distinct values
  in existing `webhook_rules` (plus “Custom” allowing free text).
- **Send Test** calls **`receive-external-webhook`** using
  `supabase.functions.invoke` with headers:
  - `x-webhook-secret` or `Authorization: Bearer <GATEWAY_API_KEY>` — match
    production ingest (**same as Famous §3 auth**).
  - Use **`VITE_GATEWAY_API_KEY`** (admin-only UI; never log to console in prod builds if possible).
- **Response viewer** (pretty JSON): show full JSON body; prominently surface
  **`rules_matched`**, **`rules_succeeded`**, **`rule_results`** (or whatever
  the edge returns today). Show errors clearly.

Ensure only **admin/staff** can see this panel (same as Rules tab).

================================================================================
3) AUTOMATIC CLAIM ASSIGNMENT (webhook-created claims)
================================================================================

**Migration — `claims` table:**

- `assigned_to` uuid NULL REFERENCES `profiles(id)` or `auth.users(id)` — match
  your app’s “staff user” FK.
- `assigned_at` timestamptz NULL
- Index on `(assigned_to)` and partial index on unassigned
  `WHERE assigned_to IS NULL` for admin lists.

**`receive-external-webhook` — `create_claim` action:**

- After a successful **`claims`** insert, **assign** round-robin:
  1. Load candidate users: `profiles` where `role in ('admin','staff')` or
     `is_staff = true` (match your schema); active only if you have a flag.
  2. **Round-robin:** store cursor in **`app_settings`**, e.g.
     `claim_assignment_rr_index` (integer, wrap with modulo candidate count).
     Increment after each assignment. Skip empty candidate list (leave
     unassigned).
  3. Set **`assigned_to`** and **`assigned_at = now()`** on the new claim row.

**Admin — Claims tab:**

- New **Assignments** subsection: list **unassigned** claims (limit + pagination),
  each row: claim #, user, status, created, **Assign to** dropdown (staff list),
  save button or inline confirm.

**ClaimHistory (policyholder / user-facing):**

- On each claim card, show **Assigned to: &lt;name&gt;** when `assigned_to` set
  (resolve display name/email from `profiles` via API join or denormalized field).

**api.ts:** `assignClaim(claimId, staffUserId)`, `listUnassignedClaims`, extend
`Claim` type with `assigned_to` / `assigned_at` + optional `assignee_name`.

================================================================================
DELIVERABLES
================================================================================

- Migrations: `retry_queue`, `claims` columns, indexes, pg_cron for
  `process-retry-queue`, any `app_settings` keys for RR cursor.
- Edge: updated `send-notification`, new `process-retry-queue`, naming alignment
  in `receive-external-webhook` outbound rows.
- Frontend: Webhooks tab retries UI; WebhookRulesTab Test Webhook panel;
  Claims tab Assignments; ClaimHistory assignee display.
- Update Famous **README** + **E2E_SMOKE_TEST.md**: retry flow, test panel,
  assignment + SQL checks.

Reply with: file list, cron expression used, canonical `event_type`/`source`
chosen in §0, and any RLS policies added.
```

---

**Files in this repo (reference only):** `migrations/retry_queue.example.sql`, `migrations/claims_assignment.example.sql`.
