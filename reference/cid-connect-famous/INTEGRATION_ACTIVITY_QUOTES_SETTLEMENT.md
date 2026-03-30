# Activity feed wiring + carriers + settlement email

Paste the block below into **Famous** (or merge files from this folder).

---

## A) Services activity (complete wiring)

1. **ServicesScreen.tsx** — Replace the static Clock / “No recent activity” block with:
   ```tsx
   <ServicesActivityFeed onNavigateActivity={onNavigateActivity} />
   ```
2. **ServicesScreenProps** — Add `onNavigateActivity: (item: ActivityItem) => void | Promise<void>`.
3. **MainApp** — Pass handler:
   - **claim** → `getClaimById(row.id)` → `setSelectedClaim` → `setServiceView('claim-detail')`
   - **coi** → `setServiceView('coi-history')` (optional: scroll/highlight by id later)
   - **policy** → `setServiceView('policy')` or your existing policy tab view key

---

## B) Carriers + quote flow

1. **SQL** — Run `migrations/carriers_and_policy_carrier.sql` (creates `carriers`, `policies.carrier_id`, seed rows, RLS).
2. **analyze-quote Edge Function** — After AI analysis, resolve `segment` (lowercase), load active carriers whose `segments` includes that segment (see `edge-functions/analyze-quote-carriers.snippet.ts`). Return `carrierOptions: [{ id, name, logo_url, rating, description }]`.
3. **QuoteResults.tsx** — Show selected carrier name, logo (`<img>`), rating; list options from API response.
4. **bindQuote** — On bind, persist `carrier_id` on `policies` (and any quote row if needed).

---

## C) Settlement notification email

1. **send-notification** — Support `new_status: "settlement_set"` and optional `extra_context` (plain text). Email subject/body: settlement recorded for claim; include `extra_context` lines (e.g. amount + date). Escape HTML in `extra_context`.
2. **sendStatusNotification** in `api.ts` — Pass through `extra_context` to the edge function body.
3. **AdminDashboard** — After **`updateClaimSettlement`** succeeds, call **`notifyClaimSettlementRecorded`** (see `api.notifySettlement.ts`) or inline:
   - `getUserEmailById(claim.user_id)`
   - `sendStatusNotification({ ..., entity_type: 'claim', new_status: 'settlement_set', extra_context: 'Settlement amount: $X — Settlement date: YYYY-MM-DD' })`
4. **Do not** treat `settlement_set` as a normal claim status change in the generic “all status changes” notifier if that would duplicate emails — settlement-only path is enough.

---

## Paste into Famous (single prompt)

```text
Complete the Services activity feed: replace ServicesScreen static Recent Activity placeholder (Clock icon div ~lines 311-320) with <ServicesActivityFeed onNavigateActivity={onNavigateActivity} />. Add onNavigateActivity to ServicesScreenProps. In MainApp pass handler: claim → getClaimById → setSelectedClaim → claim-detail; coi → coi-history; policy → policy tab.

Add carriers: create carriers table (id, name, logo_url, segments text[], rating, description, is_active), seed 3-4 rows, policies.carrier_id FK. Update analyze-quote edge function to return carrierOptions for the quote segment after AI analysis. Update QuoteResults to show carrier logos/ratings and bindQuote to save carrier_id on policy.

Settlement email: extend send-notification for new_status settlement_set and optional extra_context. Extend sendStatusNotification to pass extra_context. After admin updateClaimSettlement succeeds, email the policyholder with settlement amount and date. Avoid duplicate emails if generic claim status notifier already fires.
```

---

## Reference files

| File | Purpose |
|------|---------|
| `edge-functions/send-notification/index.ts` | Updated: `settlement_set`, `extra_context` |
| `api.notifySettlement.ts` | `notifyClaimSettlementRecorded` after settlement save |
| `migrations/carriers_and_policy_carrier.sql` | carriers + `policies.carrier_id` |
| `edge-functions/analyze-quote-carriers.snippet.ts` | Query pattern |
