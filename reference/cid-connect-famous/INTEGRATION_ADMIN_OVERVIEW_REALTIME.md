# Admin Overview — real-time dashboard (paste into Famous)

Copy everything inside the fence below into Famous’s change box.

---

```text
Implement the Admin Overview tab as a real-time activity dashboard. Replace any static placeholder stats with live data.

REQUIREMENTS

1) Realtime subscriptions
- Use Supabase client `channel().on('postgres_changes', …)` for schema `public` and tables: `claims`, `coi_requests`, `policies`.
- On any insert/update/delete on those tables, refresh the metrics that depend on them (Today counts and/or sparkline data).
- Ensure Realtime is enabled for these tables in the project (Database → Replication); if not, document what to enable.

2) Today’s Summary card (single card section with 4 sub-stats)
- Claims filed today: count `claims` where `created_at` is on the current local day (or UTC—pick one and be consistent).
- COIs completed today: count `coi_requests` where `status` = 'completed' (or your completed value) AND `created_at` or `updated_at` falls today—use the field that reflects completion time; if only `updated_at` exists for status changes, use that when status is completed.
- Policies bound today: count `policies` where `created_at` (or `bound_at` if you have it) is today.
- Emails sent today: count rows in `admin_audit_log` for today where the action indicates an email was sent (e.g. action contains 'email', or a dedicated action name you already log—match existing audit logging). If no reliable filter exists, add a small convention: e.g. log `email_sent` from send-notification success path and filter on that.

3) Sparklines (inline SVG only, no chart library)
- Next to each of the three primary headline stats (or next to Today’s four—your layout choice), show a mini 7-day trend: one sparkline per metric (claims per day, COI completions per day, policies bound per day). Last 7 calendar days including today.
- Implement as small `<svg>` paths (polyline or path) with fixed width/height (~80×24), stroke brand orange/slate.
- Data: query counts per day for the last 7 days (either 7 parallel queries or one RPC/SQL—prefer one round-trip if easy). Handle zeros.

4) Live activity feed
- Show the last 20 “actions” across entity types, newest first. Each row: short label (e.g. “Claim submitted”, “COI status → completed”, “Policy bound”), entity reference if available (claim number, policy number, COI request number), relative timestamp (“2 hours ago”).
- Sources: union recent rows from `claims`, `coi_requests`, `policies` (and optionally `admin_audit_log` for email events)—or poll `admin_audit_log` only if simpler. Prefer mixed entity feed for richness.
- Auto-refresh: when Realtime fires, refetch the feed; also set interval refresh every 60s as backup.

5) UX
- Loading skeletons while first fetch runs.
- Empty states when no activity.
- Keep existing Admin layout/tabs; only replace the Overview tab content.

6) Files
- Likely: new component e.g. `AdminOverviewLive.tsx` or replace inner content of existing Overview tab; wire from `AdminDashboard.tsx`.
- Add any small helpers in `api.ts` for day-bounded counts if needed (e.g. `getOverviewMetrics()`, `getActivityFeed()`)—or keep queries in the component if minimal.

7) At the end, list files changed and any SQL/Realtime settings the operator must verify.
```

---

Nothing else in this repo is required to use the above prompt.
