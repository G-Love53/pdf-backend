# CID Connect — handoff & Q&A for Famous

Copy everything below the line into Famous (or use section-by-section). **Famous / your Supabase project is source of truth.** The `pdf-backend` repo only holds reference snippets under `reference/cid-connect-famous/` — align or ignore as needed.

**After Famous replies:** paste answers into **`FAMOUS_HANDOFF_RESPONSES.md`** (or replace that file) so the repo stays the drift log.

---

## 1. Context

- **App:** CID Connect (policyholder + admin).
- **Backend of record for ops:** CID-PDF-API on Render (`cid-pdf-api.onrender.com`) where applicable; **Supabase** for auth, DB, storage, Edge Functions.
- **Goal of this message:** Confirm what is **deployed and verified**, resolve **open gaps**, and answer **technical questions** so the product and handoff docs stay aligned.

---

## 2. Please confirm (yes / no + one line each)

1. **`receive-external-webhook`** — After a successful inbound POST, does the function **load active `webhook_rules`**, match **`event_type`** (exact) and **`source`** (NULL = wildcard), and **execute** `log_audit` / `send_notification` / `create_claim` with failures isolated (still **200** to caller)? If not, is rule execution planned?
2. **`webhook_events`** — Do you log **inbound** and **outbound** rows (including **`webhook_rule_execution`** or equivalent) with enough detail for the admin Webhooks tab?
3. **`check-renewals`** — Is it scheduled **daily at 08:00 UTC** (`0 8 * * *`) via **Dashboard Edge Function Schedules** or **pg_cron**? Which one?
4. **`app_settings`** — Are **`renewal_cron_enabled`**, **`renewal_last_cron_at`** (or agreed name), and optionally **`renewal_cron_schedule_method`** / **`renewal_cron_expression`** / notes present and used?
5. **Admin — Renewals tab** — Manual **“Run Renewal Check”** and cron **on/off** toggle: both working against the same flags?
6. **Admin — Overview** — **`AdminAlertsBanner`** (expiring policies, stale claims, failed renewals/webhooks): wired and performant?
7. **Admin — Rules tab** — Full CRUD on **`webhook_rules`** + JSON validation + example seeds?
8. **Quote History — Compare** — Selecting 2–3 quotes opens a **comparison view** (route or modal). Is **`MainApp`** wired so **`QuoteComparison`** actually renders with selected IDs?
9. **Policy Chat / Coverage Chat** — End-to-end: **`chat_messages`**, **`coverage-chat`** edge, nav entry; any env vars missing in preview vs prod?
10. **Secrets** — **`GATEWAY_API_KEY`**, **`RESEND_API_KEY`**, **`SUPABASE_SERVICE_ROLE_KEY`** (functions), **`WEBHOOK_INGEST_SECRET`** (if used), AI gateway keys: all set where needed?

---

## 3. Please answer explicitly

**A. Webhook ingest auth**  
How does **`receive-external-webhook`** authenticate callers? (`x-gateway-key`, `Authorization: Bearer`, `X-Webhook-Secret`, other?) Exact header names and secret names in Supabase.

**B. Rule matching**  
Confirm: **`event_type_match`** is **exact** match on incoming **`event_type`**. **`source_match`**: NULL or empty = match any source; non-null = must equal incoming **`source`**. Any substring or regex — yes or no?

**C. `log_audit` from Edge**  
Can **`admin_audit_log`** receive inserts from the Edge Function (service role)? Any RLS or FK issues with **`admin_user_id`** null for system rows?

**D. `send_notification` from rules**  
When a rule invokes **`send-notification`**, which body fields are required for your templates? Any rate-limit handling you rely on?

**E. `create_claim` from rules**  
Minimum **`claims`** columns for a valid insert from automation? How do you map **`action_config.field_mappings`** to payload paths in production?

**F. Cron documentation**  
Where should “schedule is Dashboard vs pg_cron” be documented for operators — only **`app_settings`**, internal wiki, or README in repo?

**G. Known issues**  
List any open bugs, flaky flows, or tech debt you want the next sprint to pick up (admin, webhooks, renewals, chat, quotes).

---

## 4. Optional: merge from pdf-backend reference

If rule execution in **`receive-external-webhook`** is **not** complete, review:

- `reference/cid-connect-famous/INTEGRATION_RECEIVE_WEBHOOK_RULES_EXECUTION.md`
- `reference/cid-connect-famous/edge-functions/receive-external-webhook/index.ts`

Adapt **`webhook_events`** column names to your schema, deploy, and re-test.

---

## 5. Smoke test (please run or confirm already run)

Use **`reference/cid-connect-famous/E2E_SMOKE_TEST.md`** as the script, or confirm each step:

| # | Step |
|---|------|
| 1 | Admin → Overview → alerts banner behaves as designed |
| 2 | Admin → Rules → create rule `test_event` + `log_audit` (or equivalent) |
| 3 | Admin → Renewals → toggle cron + manual run |
| 4 | Policy Chat → message → AI reply with coverage context |
| 5 | Quote History → compare 2–3 quotes → comparison UI |
| 6 | POST inbound webhook → **200** → inbound `webhook_events` + rule execution logs + `log_audit` row if applicable |

**Paste results:** pass/fail per row + any errors (function name, HTTP status, DB error).

---

## 6. What we need back from you

1. Answers to **§2** (checklist) and **§3** (questions).  
2. **§5** smoke results or “already verified on YYYY-MM-DD in env X.”  
3. **Deploy notes** if anything changed (function names, new secrets, migration names).  
4. **Quote compare:** confirm route name and prop wiring (`onCompareQuotes`, `quoteId`s, etc.).

Thank you — this keeps `pdf-backend` handoff docs and Famous in sync.
