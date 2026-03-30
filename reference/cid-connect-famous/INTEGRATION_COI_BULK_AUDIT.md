# COI bulk actions + all-claims CSV + audit log

## 1) COI tab — bulk selection (mirror Claims)

- State: `selectedCoiIds: Set<string>`, `bulkCoiUpdating: boolean`
- `toggleCoiSelection(id)`, `toggleSelectAllCois()`, `handleBulkCoiStatusUpdate(targetStatus: 'processing' | 'completed' | 'failed')`
- Per-row checkbox with **`stopPropagation`** if rows expand
- Header **Select all (N)**
- Floating bar: **Mark processing** | **Mark completed** | **Mark failed** | **Clear**
- **`window.confirm`** then **sequential** loop: for each id, load row → **`handleCoiStatusUpdate`** (or `updateCoiRequestStatus` + **`afterCoiStatusUpdate`** for email when `completed`/`failed` per your rules)
- Clear selection + refresh + toast

**Audit:** After each successful single or bulk COI update, **`logAdminAction({ action: 'coi_bulk_update' | 'coi_status_change', entity_type: 'coi_request', ... })`**.

---

## 2) Download all claims CSV

- **`downloadAllClaimsReportCsv()`** in **`api.ts`** — see **`api.downloadAllClaimsReport.ts`**
- Import **`escapeCsvCell`**, **`formatMoneyCsv`**, **`getAllClaims`** from **`@/api`** (if helpers live in **`api.ts`**; else import helpers from the same module as settlement CSV)
- Button in **Claims tab filter card** header row (next to search/filters): **“Download claims report”**
- Columns: `claim_number`, `segment`, `status`, `claim_type`, `incident_date`, `estimated_amount`, `settlement_amount`, `settlement_date`, `description`, `created_at`
- **All** rows from **`getAllClaims()`** (no settlement filter)

---

## 3) Audit log

1. Run **`migrations/admin_audit_log.sql`** — adjust **RLS** `profiles.role` / **`is_staff`** to match your schema.
2. Add **`admin_email`** column if not in first draft (included in reference migration).
3. **`logAdminAction`** — **`api.auditLog.ts`**; call after:
   - claim status change / settlement save / bulk claims  
   - COI status / bulk COI / COI PDF URL save  
   - (optional) policy/carrier admin edits  

**Suggested `action` strings:** `claim_status_change`, `claim_settlement`, `claim_bulk_update`, `coi_status_change`, `coi_bulk_update`, `coi_pdf_url`.

4. **Admin tab “Audit Log”** — render **`AuditLogTab.tsx`**, **`getRecentAuditLogs`**, filters, 50 rows.

**Note:** If **`profiles.email`** does not exist, use **`auth.users`** via Edge Function for email, or store only **`admin_user_id`** and resolve email in UI via a lookup (slower).

---

## Paste into Famous

```text
1) Admin COI tab: same bulk pattern as Claims — selectedCoiIds Set, select all, per-row checkboxes, floating bar with Mark Processing / Mark Completed / Mark Failed / Clear, confirm dialog, sequential handleCoiStatusUpdate (or update + afterCoiStatusUpdate) per row. Log logAdminAction for coi_bulk_update.

2) api.ts: add downloadAllClaimsReportCsv using getAllClaims + escapeCsvCell + formatMoneyCsv — all claims, columns claim_number, segment, status, claim_type, incident_date, estimated_amount, settlement_amount, settlement_date, description, created_at. Add button in Claims filter card header.

3) SQL admin_audit_log + admin_email denormalized; logAdminAction + getRecentAuditLogs; Audit Log tab with filters; call logAdminAction from claim/COI/settlement/bulk handlers.

Align action string constants with AuditLogTab filter options. Summarize files changed.
```
