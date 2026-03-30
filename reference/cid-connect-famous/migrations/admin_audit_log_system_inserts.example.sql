-- Allow automation / webhook rules to insert admin_audit_log rows with no human admin.
-- Famous reported: admin_audit_log.admin_user_id was NOT NULL and blocked system rows.

ALTER TABLE public.admin_audit_log
  ALTER COLUMN admin_user_id DROP NOT NULL;

-- Optional: index for system/audit queries (name as deployed in Famous may differ)
-- CREATE INDEX IF NOT EXISTS idx_admin_audit_log_system
--   ON public.admin_audit_log (created_at DESC)
--   WHERE admin_user_id IS NULL;
