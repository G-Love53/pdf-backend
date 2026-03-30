# Cron + webhook rules + admin alerts + Q&A audit — paste into Famous

**Status:** Blocks **A–D** are **implemented in Famous** (reference snapshot: repo **`README.md`** → section *Cron + rules + alerts + Q&A audit*). This file remains the original one-shot prompt for history and diffing.

Copy **only** the fenced block below into Famous (for a fresh project or regression pass).

---

```text
Implement the following. Part D is mandatory discovery/fix for the conversational Q&A feature.

--- A) PG_CRON FOR check-renewals (MIDNIGHT UTC) + LAST RUN ---

- Schedule **check-renewals** to run **daily at 00:00 UTC** (midnight UTC), **unless** an existing schedule (e.g. **08:00 UTC**) is already agreed — then document and keep one canonical time.
- Use **pg_cron** + **pg_net** `net.http_post` to POST to `https://<PROJECT_REF>.supabase.co/functions/v1/check-renewals` with `Authorization: Bearer <SERVICE_ROLE>` and `Content-Type: application/json`, **or** use Supabase **Edge Function schedules** if HTTP from cron is not enabled — document which path you used.
- Store **service role** via **Vault** / secrets reference in SQL — never commit raw keys.
- On **successful** completion of **check-renewals**, write **`app_settings`** key `renewal_cron_last_run_at` **or** `renewal_last_cron_at` (pick one canonical name) = ISO timestamp. The edge function should set this at the end of a successful run.
- **AdminRenewalAlerts** tab: display **last run** with that timestamp (or "Never" if null).

--- B) WEBHOOK RULES ENGINE ---

- SQL: **`webhook_rules`** table: id, **source_match** (text, nullable for wildcard), **event_type_match** (text), **action_type** (enum or text: `create_claim`, `update_policy_status`, `send_notification`, etc.), **action_config** (jsonb), **is_active** (boolean), **created_at**.
- RLS: admin/staff CRUD; no public access.
- **Admin** tab **"Webhook rules"**: list, create/edit, toggle active, validate JSON for **action_config**.
- **receive-external-webhook** (after inserting **inbound_webhook_events**): load active rules, match **source** and **event_type** (substring or exact — document), execute **action_type** with **action_config** (e.g. map payload fields to claim insert). **Guardrails:** validate payloads, limit destructive actions, log errors to **webhook_events** or audit. Failed rule execution should not return 500 to the external caller unless you want retries — prefer 200 + internal error log.

--- C) REAL-TIME ADMIN ALERTS BANNER (OVERVIEW) ---

- At **top of Overview** tab (above **AdminOverviewLive** or inside it): **dismissible** alert strip for **critical** items:
  - Policies **expiring within 7 days** where renewal flow not started (define rule: e.g. no `renewal_notifications` success in last N days, or flag on policy — align with your schema).
  - Claims in **submitted** (or equivalent) **> 48 hours** without status change.
  - **Failed** rows in **renewal_notifications** (recent window, e.g. 7 days).
  - **Failed** inbound webhook processing (if you track processing status; else failed inserts only).
- Severity: **critical** / **warning** / **info**; color-coded; **link** to Renewals / Claims / Webhooks tab as appropriate.
- Queries can run on Overview load + refresh with Realtime/polling; keep performant (indexes).

--- D) CONVERSATIONAL Q&A (KEY PRODUCT FEATURE) — AUDIT & COMPLETE ---

- **Discover** what already exists: search codebase and Supabase for **`coverage-chat`**, **`chat_messages`**, **`PolicyChat`**, **`Chat`**, any **AI** / **Gemini** / **OpenAI** client, and **Edge Functions** list.
- **Required outcome:** a **policyholder-facing** (or in-app) **Q&A / chat** experience that:
  - Calls the **existing** `coverage-chat` edge function (or equivalent) with **auth context** and **segment/policy context** if applicable.
  - Persists or displays **conversation history** if **`chat_messages`** table exists; if not, implement minimal persistence per user/session.
  - Handles **loading, errors, and empty states**.
- **Deliverable:** if Q&A is **partially** wired, **complete** the UI + API + RLS. If **only** the edge function exists, **build the screen(s)** and wire **`supabase.functions.invoke('coverage-chat', …)`** (or correct name). Document env vars (**API keys** in Secrets).
- Add a short **"Q&A"** or **"Policy chat"** entry under **Services** or **main nav** if missing.

At the end, list: migrations, edge function changes, new tabs, **Q&A files touched**, and confirmation that **end-to-end Q&A was verified in preview**.
```

---

**File:** `reference/cid-connect-famous/INTEGRATION_CRON_RULES_ALERTS_QA.md` — single paste for Famous; no other files required.
