# Email templates + audit CSV/pagination + admin users

## 1) `email_templates` + Templates sub-tab + edge function

- Run **`migrations/email_templates.sql`**.
- **`api.emailTemplates.ts`** — list / upsert / delete / **`previewTemplate`**.
- **`EmailTemplatesTab.tsx`** — CRUD + preview (**`dangerouslySetInnerHTML`** — admin-only).
- **`send-notification`**: merge **`template-lookup.snippet.ts`** — service-role fetch by **`entity_type`** + **`status_trigger`** (match **`new_status`** lowercased). Interpolate **`{{reference_number}}`, `{{extra_context}}`, `{{user_email}}`**. If no row → existing **`buildEmailContent`**.
- **Bulk notifications** keep calling the same edge function; templates apply automatically when rows exist.

---

## 2) Audit log: dates, CSV, pagination

- Extend **`getRecentAuditLogs`** per **`api.auditExtended.ts`**: **`startDate`**, **`endDate`**, **`offset`**, **`limit`**, return **`{ rows, total }`** (use **`count: 'exact'`**).
- **`AuditLogTab`**: start/end **`<input type="date">`**, pass filters; **Load more** → **`offset += limit`** append or replace.
- **`downloadAuditLogCsv(filters)`** — paginates in chunks (see reference), columns: timestamp, admin_email, action, entity_type, entity_id, details (JSON stringified). Map **`details`** column if your table uses **`details`** instead of **`old_value`/`new_value`**.

---

## 3) User management tab

- Run **`migrations/profiles_admin_read.sql`** — **tighten RLS** to your security model (admin-only update is safer).
- **`api.adminUsers.ts`** — **`getAllProfiles`**, **`updateUserRole`**.
- **`AdminUsersTab.tsx`** — stats, search, role **`<select>`**, confirm, **`logAdminAction`** on change.
- If **`logAdminAction`** inserts **`details`** JSONB only, map **`old_value`/`new_value`** into **`details`** in your **`api.ts`** insert.

---

## Paste into Famous

```text
1) email_templates table + Admin Templates sub-tab with CRUD and HTML preview. Update send-notification to load template by entity_type + status_trigger with {{placeholders}}, fallback to current defaults.

2) AuditLogTab: date range filter on created_at, downloadAuditLogCsv with filters, pagination (offset/limit + load more or page), extend getRecentAuditLogs.

3) Admin Users tab: getAllProfiles, searchable sortable table, inline role dropdown agent/staff/admin with confirm + audit log user_role_change; stats row; RLS for staff/admin read and admin update.

Summarize SQL migrations and files changed.
```
