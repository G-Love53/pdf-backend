# CID Connect — Famous handoff answers (recorded)

**Source:** Famous (CID Connect). **Last update:** retry queue, Test Webhook UI, claim assignment (round-robin + admin), canonical **`webhook_rule_execution`** / **`rule_execution` naming** (per Famous handoff).

---

## §2 Checklist (current)

| # | Item | Status |
|---|------|--------|
| 1 | **`receive-external-webhook` rule execution** | **YES** — Outbound uses **`webhook_rule_execution`** / **`rule_execution`** (constants). Inbound summary + rule actions. |
| 2 | **`webhook_events` logging** | **YES** — Inbound + outbound; dedup; **retry processor** logs outcomes |
| 3 | **`check-renewals` schedule** | **YES** — **pg_cron** **08:00 UTC** (+ Dashboard option) |
| 4 | **`app_settings`** | **YES** — renewals + **round-robin cursor** for claim assignment |
| 5 | **Admin Renewals** | **YES** |
| 6 | **AdminAlertsBanner** | **YES** |
| 7 | **Webhook Rules** | **YES** — CRUD + execution + **Test Webhook** panel (**`sendTestWebhook`**, JSON editor, per-rule Play, result JSON) |
| 8 | **Quote comparison** | **YES** — **`quote-compare`** wired |
| 9 | **Coverage Chat** | **YES** |
| 10 | **Secrets** | **YES** — **`GATEWAY_API_KEY`**, **`RESEND_API_KEY`**, service role |
| 11 | **Outbound naming alignment** | **YES** — Legacy rows migrated to **`webhook_rule_execution`** / **`rule_execution`**; edge uses same constants |
| 12 | **Retry queue (`send-notification` 429/5xx)** | **YES** — **`retry_queue`** + enqueue with backoff **1m / 5m / 15m**; **`queued: true`** in response; **no** enqueue on logical **4xx** |
| 13 | **`process-retry-queue` edge** | **YES** — Re-invoke with **`skip_dedup=true`**; succeeded / failed / requeue; verify **pg_cron** (or Dashboard) is scheduled in Supabase |
| 14 | **Admin retry UI** | **YES** — **`AdminClaimAssignments`** under Claims Charts: pending/failed, manual retry, cancel, **Process Now**; **`getRetryQueueRows`**, **`retryRetryQueueNow`**, **`cancelRetryQueueItem`**, **`triggerProcessRetryQueue`** |
| 15 | **Claim assignment** | **YES** — **`claims.assigned_to`** / **`assigned_at`** (FK **`profiles`**); **`assignClaimRoundRobin()`** in **`receive-external-webhook`** (least-loaded tie-break + RR via **`staff_claim_counts`** / **`app_settings`** index); **`AdminClaimAssignments`** manual assign; **`ClaimHistory`** shows assignee (batch **`getProfileNamesByIds`**) |

---

## §2b Outbound naming (resolved)

Canonical rule-execution rows: **`event_type` = `webhook_rule_execution`**, **`source` = `rule_execution`**. Historical **`rule_execution_*` / `rule-execution`** rows updated in DB. Admin filters and edge constants aligned.

---

## §3 Behavior (Famous-reported)

**A. Ingest auth:** **`x-webhook-secret`** or **`Authorization: Bearer`** vs **`GATEWAY_API_KEY`**.

**B. Rule matching:** **`event_type_match`** exact; **`source_match`** NULL = wildcard; else exact.

**C. `log_audit`:** **`admin_user_id`** nullable for system rows.

**D. `send_notification`:** Field resolution + **5-min dedup**; **`skip_dedup: true`** for retries. On **429** / **5xx** → **`retry_queue`** with exponential backoff; response may include **`queued: true`**.

**E. `create_claim`:** **`field_mappings`** + **automatic assignment** via **`assignClaimRoundRobin()`** after insert.

**F. Quote UI:** **`quote-compare`** + **QuoteComparison**.

**G. Schema:** **`retry_queue`** (includes **`payload`** per Famous), RLS (staff read/update, service role full); **`staff_claim_counts`** view; indexes **`idx_retry_queue_pending`**, unique partial pending/failed per event, **`idx_claims_assigned_to`**, **`idx_claims_unassigned`**.

---

## §4 Documentation in Famous (not this repo)

Trust Famous **README** / **E2E** for curl replacement via **Test Webhook** and retry/assignment steps.

---

## §5 Verify after deploy (you)

1. **pg_cron** (or Dashboard) for **`process-retry-queue`** — often forgotten; confirm it runs every **5 minutes** (or your chosen cadence).
2. Force a Resend **429** in staging → row in **`retry_queue`** → processor clears or requeues.
3. **Test Webhook** panel → **`test_event`** → see **`rules_matched`** / results in UI (no curl).

---

## Reference in this repo (optional drift diff)

- **`edge-functions/receive-external-webhook/index.ts`** — lags Famous (assignment, constants).
- **`INTEGRATION_WEBHOOK_RETRY_TEST_ASSIGNMENT.md`** — original prompt; **implemented** by Famous.
- **`FAMOUS_FOLLOWUP_IMPLEMENT_MISSING.md`** — historical.
