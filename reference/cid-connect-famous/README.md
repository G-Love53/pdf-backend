# CID Connect (Famous) — handoff snippets

**Canonical app:** CID Connect — **source of truth = Git repo** opened in Cursor; **Famous** deploys/runs it. Until Connect is in Git, this folder holds paste snippets. See **`CONNECT_GIT_WORKFLOW.md`**.

This folder is optional backup / drift for `pdf-backend` — **do not** treat these snippets as newer than the Connect repo once it exists.

**RSS:** One backend host for notify + ops: `https://cid-pdf-api.onrender.com` with `segment` in JSON bodies — no per-segment duplicate backends for the same flow.

**Latest answers from Famous:** **`FAMOUS_HANDOFF_RESPONSES.md`**. Prompts (history): **`FAMOUS_HANDOFF_QA_PROMPT.md`**, **`FAMOUS_FOLLOWUP_IMPLEMENT_MISSING.md`**, **`INTEGRATION_WEBHOOK_RETRY_TEST_ASSIGNMENT.md`** (implemented).

**Env drift:** If the Supabase dashboard project ref ≠ **`VITE_SUPABASE_URL`** in the app, see **`SUPABASE_PROJECT_CONSOLIDATION.md`**.

**Segment COI → Famous Supabase:** Point Netlify (and code) at the **same** URL + **anon** key as Connect — **`SEGMENT_COI_SUPABASE_TO_FAMOUS.md`**.

**Repo-wide Supabase grep summary:** **`SUPABASE_REPO_INVENTORY.md`**.

**Famous — dynamic segments / backend URLs:** **`FAMOUS_DYNAMIC_SEGMENTS_APP_SETTINGS.md`**. **Fix pack:** **`INTEGRATION_MERGE_SEGMENT_BACKENDS.patch.md`**, **`api.segmentBackends.ts`**, **`migrations/app_settings_segment_backends_seed.sql`**.

### Implemented in Famous (reference)

| Area | Location / notes |
|------|------------------|
| Types | `src/types/index.ts` — `COIRequest.generated_pdf_url` |
| API | `src/api.ts` — `getUserCoiRequests`, `getAllCoiRequests()`, `updateCoiRequestStatus()`, `updateCoiRequestPdfUrl()` (admin); `submitClaim` / `uploadClaimPhotos`; duplicate `updateClaimStatus` fix |
| File a Claim | `src/components/services/FileClaim.tsx` — `getUserPolicies`, multi-policy selector, `submitClaim`, copy claim #, backend notify warning |
| COI history | `src/components/services/COIRequestHistory.tsx` — cards, filter, PDF download link |
| Navigation | `ServicesScreen.tsx` — `onCoiHistory`, “COI Request History” under Documents; `MainApp.tsx` — `coi-history` view |
| Admin | `src/components/admin/AdminDashboard.tsx` — tab “COI Requests”, search/filter, expandable rows, status + `generated_pdf_url` save |
| Admin+ | Same file — **Analytics** tab (`AnalyticsTab.tsx`, `getAnalyticsData`); **afterClaimStatusUpdate** / **afterCoiStatusUpdate** + `sendStatusNotification` toasts |
| Claim detail | `MainApp.tsx` — `claim-detail` + `selectedClaim`; `ClaimHistory` — `onOpenClaim`; `ClaimDetail.tsx` |
| DB | `coi_requests.generated_pdf_url`; staff/admin RLS SELECT/UPDATE; `claims` columns aligned |

Legacy snippets in this folder (still useful for diffing):

- `api.claims-extensions.ts` — older names `adminListCoiRequests` / `adminUpdateCoiRequest`; Famous uses the split admin helpers above.
- `AdminCoiSection.tsx` — superseded by the Admin Dashboard tab in Famous.
- `integration-notes.ts` — obsoleted once Famous wired `coi-history` + Services.

**Supabase:** Ensure `coi_requests` has a `generated_pdf_url` column (text, nullable) if admins store the issued COI link. Align `claims` columns with `api.claims-extensions.ts` (`claim_number`, `photo_paths`, `backend_notified`, `backend_response`, etc.) or adjust the insert payload.

**Backend notify:** `submitClaim` POSTs to `VITE_CID_API_URL` + `VITE_CLAIM_NOTIFY_PATH` (default `/file-claim`). CID-PDF-API may not expose this route yet; add a handler on Render or proxy via an Edge Function until it exists.

### Additional reference (admin notify, analytics, claim detail)

| File | Purpose |
|------|---------|
| `INTEGRATION_ADMIN_CLAIM_DETAIL.md` | Steps + Famous prompt for notifications, Analytics tab, `claim-detail` route |
| `adminNotifyHelpers.ts` | `afterClaimStatusUpdate` / `afterCoiStatusUpdate` + toasts |
| `components/AnalyticsTab.tsx` | 4th-tab analytics UI (`getAnalyticsData`) |
| `components/ClaimDetail.tsx` | Full claim view + signed photo URLs |
| `api.getClaimPhotoUrl.ts` | Merge into `api.ts` as `getClaimPhotoUrl` |

### Reference — inbound webhook rule execution + QA

| File | Purpose |
|------|---------|
| `FAMOUS_HANDOFF_QA_PROMPT.md` | Paste-into-Famous questionnaire |
| `FAMOUS_HANDOFF_RESPONSES.md` | Famous checklist / behavior snapshot (updated when Famous reports changes) |
| `FAMOUS_FOLLOWUP_IMPLEMENT_MISSING.md` | Closed follow-up prompt (rule engine + quote compare + mappings — done by Famous) |
| `INTEGRATION_RECEIVE_WEBHOOK_RULES_EXECUTION.md` | Match **`webhook_rules`** after inbound **`webhook_events`**; **`log_audit`** / **`send_notification`** / **`create_claim`**; outbound execution logs |
| `edge-functions/receive-external-webhook/index.ts` | Reference Deno edge function (Famous deploys to Supabase) |
| `E2E_SMOKE_TEST.md` | Manual E2E checklist (Overview, Rules, Renewals, Chat, Quote compare, optional webhook POST) |
| `migrations/app_settings_renewal_schedule_doc.example.sql` | Optional **`app_settings`** rows documenting Dashboard vs **pg_cron** for **`check-renewals`** |
| `migrations/admin_audit_log_system_inserts.example.sql` | **`admin_user_id`** nullable for webhook **`log_audit`** (align if Famous already applied) |
| `INTEGRATION_WEBHOOK_RETRY_TEST_ASSIGNMENT.md` | **Done in Famous:** naming **`webhook_rule_execution`** / **`rule_execution`**, **`retry_queue`** + **`process-retry-queue`**, Test Webhook UI, claim assignment + **AdminClaimAssignments** (see **`FAMOUS_HANDOFF_RESPONSES.md`**) |
| `migrations/retry_queue.example.sql` | Example **`retry_queue`** table |
| `migrations/claims_assignment.example.sql` | **`claims.assigned_to`** / **`assigned_at`** |

### Next batch (edge mail, settlement, activity)

See **`INTEGRATION_NEXT_THREE.md`** — `send-notification` (Resend), `migrations/claims_settlement.sql`, `getUserRecentActivity`, `ServicesActivityFeed.tsx`, analytics settlement totals.

### Activity wiring + carriers + settlement email

See **`INTEGRATION_ACTIVITY_QUOTES_SETTLEMENT.md`** — finish `ServicesActivityFeed` in ServicesScreen, `carriers` table + `analyze-quote` + QuoteResults/bind, `settlement_set` + `extra_context` emails.

### Carrier detail + quote history + settlement fire-and-forget

See **`INTEGRATION_CARRIER_QUOTE_HISTORY.md`** — `void afterSettlementSaved(...)`, `carrier-detail` + PolicyVault, `QuoteHistory` + `quote-history` view.

### Admin bulk claims + settlement CSV

See **`INTEGRATION_ADMIN_BULK_CSV.md`** — checkboxes, floating bar, confirm, per-row `afterClaimStatusUpdate`; **`downloadSettlementReportCsv`** on Analytics.

### Quote history UX + carrier resources

See **`INTEGRATION_QUOTE_CARRIER_RESOURCES.md`** — **`components/history/QuoteHistory.tsx`**, **`getQuoteDetails`** / **`quoteRowToAnalysisResult`**, **`CarrierResourcesSection`** + **`api.carrierResources.ts`**.

### COI bulk + all-claims CSV + audit log

See **`INTEGRATION_COI_BULK_AUDIT.md`** — COI bulk bar, **`downloadAllClaimsReportCsv`**, **`admin_audit_log`** + **`AuditLogTab`**.

### Bind email + carrier browser + quote PDF

See **`INTEGRATION_BIND_BROWSER_PDF.md`** — **`notifyBindSuccess`**, **`CarrierBrowser`**, **`generate-quote-pdf`** + **`downloadQuotePdf`**.

### Templates + audit export/pagination + user admin

See **`INTEGRATION_TEMPLATES_AUDIT_USERS.md`** — **`email_templates`**, **`EmailTemplatesTab`**, audit **`downloadAuditLogCsv`** + date range + **`AdminUsersTab`**.

### Browse button + email PDF + policy timeline

See **`INTEGRATION_BROWSE_EMAIL_TIMELINE.md`** — Services **`onBrowseCarriers`**, **`email-quote-pdf`**, **`PolicyTimeline`**.

### Webhooks + campaigns + live overview

See **`INTEGRATION_WEBHOOKS_CAMPAIGNS_OVERVIEW.md`** — **`webhook_events`**, **`WebhooksTab`**, **`campaigns`**, **`AdminOverviewLive`**.

### Admin Overview — realtime only (single prompt)

Use **`INTEGRATION_ADMIN_OVERVIEW_REALTIME.md`** — one fenced block to paste into Famous; no other file required for that request.

### Bulk quote emails + renewal alerts + Claims charts

Use **`INTEGRATION_BULK_RENEWAL_CHARTS.md`** — one fenced block only.

### Overview segment breakdown + inbound webhooks + dashboard PDF

Use **`INTEGRATION_OVERVIEW_SEGMENT_INBOUND_PDF.md`** — one fenced block only.

### pg_cron renewals + quote compare + unified webhook log

Handoff: **`INTEGRATION_CRON_COMPARE_WEBHOOKLOG.md`**.

**Implemented in Famous (snapshot):** renewals + quote compare + unified **`webhook_events`**, **`receive-external-webhook`** (rule execution, **`create_claim`** + **`field_mappings`**, **round-robin claim assignment**, canonical **`webhook_rule_execution`** / **`rule_execution`**), **`send-notification`** dedup + **retry queue** on **429/5xx** with **`process-retry-queue`**, **Test Webhook** on **WebhookRulesTab**, **AdminClaimAssignments** (retries + unassigned claims), **ClaimHistory** assignee. Details: **`FAMOUS_HANDOFF_RESPONSES.md`**.

### Cron + rules + alerts + Q&A audit

Handoff: **`INTEGRATION_CRON_RULES_ALERTS_QA.md`** (original prompt; blocks A–D **implemented** in Famous — see snapshot below).

**Implemented in Famous (snapshot):**

| Block | Notes |
|-------|--------|
| **A — Renewal cron** | **08:00 UTC** (`0 8 * * *`). Famous uses **pg_cron** (migration SQL) + **`app_settings`**: **`cron_schedule_configured_at`**, **`cron_schedule_approach`**. Dashboard schedules also supported. **`check-renewals`** reads **`renewal_cron_enabled`**, writes **`renewal_last_cron_at`**. **AdminRenewalAlerts** + **CronSetupPanel** (“Mark as Configured”). |
| **B — Webhook rules** | **CRUD + execution**; canonical **`webhook_rule_execution`** / **`rule_execution`**; **Test Webhook** UI; **`send-notification`** dedup + **`retry_queue`** + **`process-retry-queue`**; **`create_claim`** + **auto-assign** + **AdminClaimAssignments**. |
| **C — Admin alerts banner** | **AdminAlertsBanner** on **AdminOverviewLive** (dismissible **critical** / **warning** / **info**): policies expiring within 7 days, claims in **submitted** more than 48 hours without status change, failed **renewal_notifications** (7d), failed **webhook_events** (7d); links via **`onNavigateTab`**. Indexes: **`policies(expiration_date)`**, **`claims(status, updated_at)`**, **`renewal_notifications(status, created_at)`**. |
| **D — Q&A** | **CoverageChat** + **`chat_messages`**, **`coverage-chat`** edge (e.g. Gemini via gateway), enhanced/basic modes, Services + bottom nav; E2E verified. |

### E2E smoke test (manual)

Use **`E2E_SMOKE_TEST.md`** — includes webhook rule execution, **`create_claim`** mappings, **`send-notification`** dedup checks (Famous may have extended beyond this repo’s copy — sync from Famous if needed).

### Webhook retries + Test Webhook UI + claim assignment

**Implemented in Famous** — see **`FAMOUS_HANDOFF_RESPONSES.md`** §2 items **11–15**. Original spec: **`INTEGRATION_WEBHOOK_RETRY_TEST_ASSIGNMENT.md`**. **Verify:** **`process-retry-queue`** has **pg_cron** or Dashboard schedule; smoke via **Rules → Test Webhook** (replace curl).

### Renewal schedule — `check-renewals` (08:00 UTC)

Configure **one** of:

| Approach | Action |
|----------|--------|
| **Dashboard** (recommended) | **Supabase Dashboard** → **Edge Functions** → **`check-renewals`** → **Schedules** → cron **`0 8 * * *`** (minute 0, hour 8, daily — **08:00 UTC**). |
| **pg_cron + pg_net** | `SELECT cron.schedule(...);` with `net.http_post` to `https://<PROJECT_REF>.supabase.co/functions/v1/check-renewals`, **`Authorization: Bearer <service_role>`**, body `'{}'::jsonb`. Store secrets via **Vault**; never commit keys. |

Famous records schedule metadata in **`app_settings`** (**`cron_schedule_configured_at`**, **`cron_schedule_approach`**, etc.) — see **`FAMOUS_HANDOFF_RESPONSES.md`**. See also **`migrations/app_settings_renewal_schedule_doc.example.sql`** for generic key ideas.
