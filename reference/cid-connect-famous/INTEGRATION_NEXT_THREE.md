# Next batch: Resend edge function, settlement columns, activity feed

**Canonical app:** Famous CID Connect. Copy files from this folder or paste the block below into Famous.

---

## Files added in this repo

| Path | Purpose |
|------|---------|
| `edge-functions/send-notification/index.ts` | Deno edge function: `RESEND_API_KEY`, HTML branding, status copy, 429 handling |
| `migrations/claims_settlement.sql` | `settlement_amount`, `settlement_date` on `claims` |
| `api.getUserRecentActivity.ts` | `getUserRecentActivity(userId)` |
| `api.getById.ts` | `getClaimById`, `getCoiRequestById`, `getPolicyById` |
| `api.analyticsSettlement.extension.ts` | Notes to extend `getAnalyticsData` + `AnalyticsData` |
| `lib/formatRelativeTime.ts` | `"2 hours ago"` helper |
| `components/ServicesActivityFeed.tsx` | Replaces static activity placeholder |
| `types.claim.snippet.ts` | `settlement_*` on `Claim` |
| `components/AnalyticsTab.tsx` | Updated with settled summary cards (optional fields) |
| `ADMIN_CLAIMS_SETTLEMENT.md` | Admin UI behavior for approved claims |

---

## Activity navigation (MainApp)

In `MainApp`, implement `onNavigateActivity` roughly as:

1. **claim** — `const row = await getClaimById(item.id)` → `setSelectedClaim(row)` → `setServiceView('claim-detail')`
2. **coi** — e.g. `setSelectedCoiId` + `coi-detail` view, or reuse COI history highlight (match your routes)
3. **policy** — policy detail view if you have one, else `policy-detail` or navigate to Quotes/Policies tab

---

## Test `send-notification` (curl)

Replace placeholders:

```bash
curl -i -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/send-notification' \
  -H 'Content-Type: application/json' \
  -H 'x-gateway-key: YOUR_GATEWAY_API_KEY' \
  -d '{
    "user_email": "you@yourdomain.com",
    "reference_number": "CLM-TEST-001",
    "entity_type": "claim",
    "new_status": "approved"
  }'
```

Expect `200` and email in Resend Logs / inbox. `401` = wrong `x-gateway-key`. `500` + RESEND message = missing `RESEND_API_KEY` on the function.

Optional env for production From address: **`RESEND_FROM_EMAIL`** = `CID Connect <notifications@verified.domain.com>`.

---

## Paste into Famous (single prompt)

```text
Implement three upgrades to CID Connect:

1) EDGE FUNCTION send-notification
- Use RESEND_API_KEY from secrets. POST https://api.resend.com/emails with Bearer auth.
- Authenticate invocations with GATEWAY_API_KEY via x-gateway-key header (match existing client).
- HTML email: CID Connect orange header, status-specific copy (e.g. claim approved: "Your claim CLM-XXX has been approved"; COI completed: "Your COI request COI-XXX is now completed").
- Handle Resend errors and HTTP 429 with clear JSON errors. Deploy function and document curl test payload.

2) CLAIMS SETTLEMENT
- Run SQL: add settlement_amount NUMERIC(14,2) and settlement_date DATE to claims (nullable).
- Update Claim TypeScript type.
- Admin Dashboard Claims tab: when status is approved, show settlement amount + settlement date inputs and save to DB.
- Extend getAnalyticsData to compute totalSettledAmount (sum settlement_amount where not null) and totalClaimsWithSettlement; show in AnalyticsTab alongside estimated totals.

3) SERVICES ACTIVITY FEED
- Add getUserRecentActivity in api.ts: parallel queries on claims, coi_requests, policies for user, merge, sort by updated_at/created_at, take 10.
- Replace static "No recent activity" in ServicesScreen with a feed: icon by type, reference number, status badge, relative time (e.g. formatRelativeTime).
- Each row clickable: navigate to claim-detail (fetch claim by id), COI detail/history as appropriate, policy detail if exists — wire through MainApp state like claim-detail.

Keep Tailwind styling consistent with the app. Summarize files changed.
```
