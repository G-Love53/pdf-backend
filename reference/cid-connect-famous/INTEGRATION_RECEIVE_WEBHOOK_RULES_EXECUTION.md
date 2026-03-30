# receive-external-webhook — rule execution after inbound log

**Status (Famous):** **`receive-external-webhook`** implements **rule execution** ( **`log_audit`**, **`send_notification`**, **`create_claim`** with **`field_mappings`** ), outbound **`webhook_events`** logs, inbound execution summary — see **`FAMOUS_HANDOFF_RESPONSES.md`**. This repo’s **`edge-functions/receive-external-webhook/index.ts`** may lag Famous’s deployed code; use for diffing only.

**Canonical implementation:** Famous Supabase project (`supabase/functions/receive-external-webhook`).

This repo holds a **reference** implementation that:

1. Authenticates the inbound POST (**`x-gateway-key`** = **`GATEWAY_API_KEY`**, or **`WEBHOOK_INGEST_SECRET`** / Bearer).
2. Inserts **inbound** **`webhook_events`** (and best-effort legacy **`inbound_webhook_events`**).
3. Loads **`webhook_rules`** where **`is_active`** = true.
4. Matches rules: **`event_type_match`** = incoming **`event_type`** (**exact**); **`source_match`** is **NULL** or empty (wildcard) or equals **`source`**.
5. For each match, runs **`action_type`** in **try/catch**:
   - **`log_audit`** — insert **`admin_audit_log`** (service role). **`action_config`** may nest under **`audit`** or be flat (`action`, `entity_type`, `entity_reference`, `new_value`).
   - **`send_notification`** — HTTP POST to **`/functions/v1/send-notification`** with **`x-gateway-key`**. Body from **`action_config.invoke_body`** or **`body`**, with **`payload.`** / **`body.`** string paths resolved from the inbound request.
   - **`create_claim`** — insert **`claims`**; **`action_config.field_mappings`** maps column names to **`payload.field`** path strings.
6. Logs each run as **outbound** **`webhook_events`** with **`event_type`** = `webhook_rule_execution`, **`response_status`** 200/500, **`response_body`** `{ ok, … }` or `{ ok: false, error }`.
7. Returns **200** `{ ok: true, inbound_id, rules_matched }` to the caller even when a rule fails (rule failure is internal only).

**File:** `edge-functions/receive-external-webhook/index.ts`

**Schema notes:**

- Align **`webhook_events`** insert columns with your Famous table (**`direction`**, **`endpoint`**, **`request_body`**, **`response_status`**, **`response_body`**, etc.). If your table still uses **`channel` / `status`** only, map or migrate before deploying this file verbatim.
- **`admin_audit_log`**: system inserts use **`admin_user_id`** = null (allowed if column nullable).

**Deploy:** `supabase functions deploy receive-external-webhook` — set secrets **`GATEWAY_API_KEY`**, **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**; optional **`WEBHOOK_INGEST_SECRET`**.

**Famous auth (align reference code):** Famous validates **`x-webhook-secret`** or **`Authorization: Bearer`** against **`GATEWAY_API_KEY`** (no separate ingest secret). The reference **`index.ts`** also accepts **`x-gateway-key`** — merge so both match production headers.
