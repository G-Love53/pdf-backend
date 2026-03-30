# Admin: bulk claim actions + settlement CSV

The settlement-email item in your message is **already implemented** (separate `afterSettlementSaved` vs `afterClaimStatusUpdate`). This doc covers **two new features**.

---

## 1) Bulk status updates (Claims tab)

**UI state**

- `selectedClaimIds: Set<string>` (or `string[]`)
- Per-row checkbox: `checked={selectedClaimIds.has(row.id)}` → toggle
- Header **Select all**: check every claim on the current list (or all loaded rows)
- **Floating bar** (fixed bottom): `N selected` + **Approve selected** + **Close selected** + **Clear** (only visible when `selectedClaimIds.size > 0`)

**Confirmation**

- Before running: `window.confirm` or modal — “Update **N** claims to **Approved**? This sends one email per claim.”

**Execution**

- For each `id` in selection:
  1. Load full claim if needed (`user_id`, `claim_number`, current row)
  2. `await supabase.from('claims').update({ status: newStatus }).eq('id', id)` (or your `updateClaimStatus` API)
  3. `await afterClaimStatusUpdate(claim.user_id, claim.claim_number, newStatus)` — **same helper as single-row** so each policyholder gets email
- Clear selection after success; toast summary “Updated N claims”
- On partial failure: show which failed

**Performance**

- Sequential `await` avoids hammering Resend/Edge; optional small delay between sends if you hit rate limits

---

## 2) Download Settlement Report (Analytics tab)

- Button: **Download settlement report** (CSV)
- Call **`downloadSettlementReportCsv()`** — see `api.downloadSettlementReport.ts`
- Uses **`getAllClaims()`**, filters **`settlement_amount IS NOT NULL`**
- Columns: `claim_number`, `segment`, `status`, `estimated_amount`, `settlement_amount`, `settlement_date`, `created_at`
- Currency columns as formatted strings (e.g. `$1,234.56`) in CSV cells

**Placement:** Top of `AnalyticsTab.tsx` next to the title, or above the charts.

---

## Paste into Famous (single prompt)

```text
AdminDashboard Claims tab — bulk actions:
- Add row checkboxes and header "Select all" for current claims list.
- Floating bottom bar when selection non-empty: show count, buttons "Approve selected" and "Close selected", and Clear.
- Show confirmation dialog before bulk action with count and target status.
- After confirm: for each selected claim id, update status in DB then call existing afterClaimStatusUpdate(user_id, claim_number, newStatus) so each notification email still sends individually. Use async handler; handle errors per row or fail-fast per your pattern.
- Refresh list after success; clear selection.

Analytics tab:
- Add button "Download settlement report" that calls downloadSettlementReportCsv: getAllClaims(), filter rows where settlement_amount is not null, export CSV columns claim_number, segment, status, estimated_amount, settlement_amount, settlement_date, created_at. Format money columns; trigger browser download.

Use existing Tailwind patterns. Add downloadSettlementReportCsv to api.ts or a small lib helper. Summarize files changed.
```

---

## Reference files

| File | Purpose |
|------|---------|
| `api.downloadSettlementReport.ts` | CSV generation + download |
| `lib/csvDownload.ts` | `escapeCsvCell`, `formatMoneyCsv` |
