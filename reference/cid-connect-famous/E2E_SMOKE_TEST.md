# CID Connect — end-to-end smoke checklist (Famous)

Run in **staging/preview** as **staff/admin**. Record pass/fail and notes for each step.

**Note:** Famous may maintain a longer script (e.g. **`create_claim`** **`field_mappings`**, **`send-notification`** dedup). Prefer their **E2E** / **README** if this file drifts.

1. **Admin Overview + alerts**  
   Log in as admin → **Overview** tab. Confirm **AdminAlertsBanner** appears when applicable (e.g. expiring policies, stale **submitted** claims). Expand or follow links to Renewals / Claims / Webhooks as expected.

2. **Webhook rules**  
   Open **Rules** tab → create a rule: **`event_type_match`** = `test_event`, **`action_type`** = `log_audit` (or your seeded equivalent), **`source_match`** NULL or a test source. Save and confirm it lists and toggles.

3. **Renewals cron**  
   **Renewals** tab → toggle **renewal cron** on/off (confirm UI). Click **Run Renewal Check** (manual). Confirm no error toast; optional: check **`renewal_last_cron_at`** / **`app_settings`** and **`webhook_events`** for outbound logs.

4. **Policy chat (Q&A)**  
   Bottom nav → **Policy Chat** / **Coverage Chat** → send a message. Confirm **AI** reply and that context (policy/coverage) appears when **enhanced** mode applies.

5. **Quote comparison**  
   **Quote History** → **Compare Quotes** → select **2–3** rows → **Compare**. Confirm comparison table/cards render (carrier, premium, limits, status).

6. **Inbound webhook + rules**  
   `POST` to **`receive-external-webhook`** with valid auth (**`x-webhook-secret`** or **`Authorization: Bearer`** token matching **`GATEWAY_API_KEY`**), JSON body `{ "source": "…", "event_type": "test_event", "payload": {} }`. Expect **200**. Verify **webhook_events** inbound row, **outbound** rule-execution rows, and **`admin_audit_log`** for **`log_audit`** ( **`admin_user_id`** may be null).

7. **`create_claim` via rule (optional)**  
   **`POST`** with **`event_type`** matching seeded rule (e.g. **`external_claim_filed`**) and **`payload`** paths that satisfy **`field_mappings`**. Expect **200**; verify new **`claims`** row (UUID / **`claim_number`**).

8. **`send-notification` dedup (optional)**  
   Invoke rule or **`send-notification`** twice within **5 minutes** with same **`user_email`** + **`reference_number`** + **`new_status`**. Second call should return **200** with skipped/dedup behavior; check **`webhook_events`** for **`skipped: true`**.

9. **Test Webhook (no curl)**  
   Admin → **Rules** → **Test Webhook** → JSON body with **`test_event`** (or use per-rule **Play**). **Send Test** → **200**; confirm JSON shows **`rules_matched`** / execution summary.

10. **Retry queue (optional)**  
   Trigger a **429** or **5xx** from **`send-notification`** in staging (or seed a **`retry_queue`** row). Confirm **`process-retry-queue`** runs (cron/Dashboard); admin **Claims Charts** → **AdminClaimAssignments** / retry section: pending item, **Process Now** or wait for schedule.

11. **Claim assignment**  
   **`POST`** **`create_claim`** rule (or UI file-claim). Webhook-created claim should get **`assigned_to`** / **`assigned_at`**. Admin: unassigned list + manual assign. User **ClaimHistory**: assignee name + date.

**Issues log** (fill during test):

| Step | Pass | Notes |
|------|------|--------|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |
| 11 | | |
