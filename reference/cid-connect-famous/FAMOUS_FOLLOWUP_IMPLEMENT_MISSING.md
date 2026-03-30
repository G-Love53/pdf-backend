# CID Connect — Famous follow-up (implement missing gaps)

**Status: completed by Famous** (rule engine, **QuoteComparison** wiring, **`field_mappings`**, **`send-notification` dedup**, **`admin_audit_log` nullable**). See **`FAMOUS_HANDOFF_RESPONSES.md`**.

---

Copy the section below into Famous **only for history / a fresh environment**. **Famous is source of truth**; `pdf-backend/reference` is only a reference kit.

---

## Starting point (what’s already done)
- Inbound webhooks are logged into unified `webhook_events` (direction=inbound).
- `check-renewals` cron/toggle + admin UI + `renewal_last_cron_at` are working.
- Admin has full CRUD for `webhook_rules`.
- Policy Chat is working end-to-end.

## Missing / regressions confirmed by Famous answers
1. **`receive-external-webhook` does NOT execute matched `webhook_rules` yet.**
2. **`QuoteComparison` component exists but is NOT wired** in `MainApp` (trigger from `QuoteHistory` compare mode is not rendering).
3. **`create_claim` rule execution lacks field-mapping / JSON path extraction** logic.
4. **`send_notification` has no rate-limiting/guardrails yet** (optional if you want to defer).

## Please implement & verify

### 1) `receive-external-webhook`: execute matched rules after inbound INSERT
After inserting the inbound row into `webhook_events`:
1. Load `webhook_rules` where `is_active = true`.
2. Match rules with:
   - `event_type_match` = **exact** incoming `event_type`
   - `source_match` is NULL = match any; otherwise **exact** match to incoming `source`
3. For each matched rule, execute `action_type` in **try/catch**:
   - `log_audit`: insert into `admin_audit_log` (service role ok). `admin_user_id` should be NULL for system rows (RLS must allow it).
   - `send_notification`: invoke edge function `send-notification` with required fields.
   - `create_claim`: insert into `claims` using `action_config.field_mappings` (JSON path extraction from inbound payload/body).
4. Log each rule execution result as an **outbound** row in `webhook_events`:
   - outbound `direction = 'outbound'`
   - `event_type = 'webhook_rule_execution'` (or your equivalent)
   - include `response_status` (200/500) and JSON `response_body` success/failure details
5. **Do not break the caller:** even if rule execution fails, still return `200` to the external webhook caller after ingest.

#### Auth headers (Famous confirmed)
- Validate inbound request auth using **`x-webhook-secret`** OR **`Authorization: Bearer <token>`** against **`GATEWAY_API_KEY`** (no `WEBHOOK_INGEST_SECRET`).

### 2) Quote comparison wiring
- Wire the existing compare UI in `QuoteHistory` so selecting 2–3 quotes results in the **comparison view** rendering.
- Confirm whether you use a route (e.g. `quote-comparison`) or a modal; either is fine as long as the selected IDs are passed into `QuoteComparison`.

### 3) `create_claim` field mapping
- Implement resolution of `action_config.field_mappings` into `claims` columns.
- Document the supported mapping syntax (e.g. `payload.<path>` vs `body.<path>`) and provide one example rule seeded in the DB.

### 4) send-notification rate limiting (optional)
- If you can do it quickly: add basic guardrails to avoid repeated sends (e.g. idempotency key or simple DB check using `webhook_events`).
- If too risky: note a follow-up ticket.

## Verification (please run)
Run `E2E_SMOKE_TEST.md` steps and confirm:
1. Admin Overview shows alerts banner and links work.
2. Admin Rules: create a `test_event` rule with `log_audit`, verify it produces an `admin_audit_log` row after inbound webhook POST.
3. Renewals: toggle cron on/off and manual Run Renewal Check.
4. Policy Chat: send message and verify AI replies with coverage context.
5. Quote History: select 2–3 quotes and verify `QuoteComparison` renders.

## Reply with
1. What file/function changed for rule execution.
2. What you used for rule matching exactness and wildcard behavior.
3. Confirmation that `receive-external-webhook` always returns 200 for external callers even when rule execution fails.
4. Confirmation that QuoteComparison is now wired (route/modal + prop plumbing).
5. Any schema mismatches you had to resolve (especially `webhook_events` column names / shape).

