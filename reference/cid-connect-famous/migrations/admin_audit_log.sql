-- Admin audit trail (run in Supabase SQL editor)

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  /** Human-readable ref e.g. CLM-xxx, COI-xxx for list UI */
  entity_reference TEXT,
  /** Denormalized at insert time so the Audit tab avoids extra joins */
  admin_email TEXT,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON public.admin_audit_log (action);
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_type_idx ON public.admin_audit_log (entity_type);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Staff/admin only: adjust to match your profiles.role or JWT claim
DROP POLICY IF EXISTS admin_audit_log_select_staff ON public.admin_audit_log;
CREATE POLICY admin_audit_log_select_staff
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'staff') OR p.is_staff = TRUE)
    )
  );

-- Inserts from app as admin (same check)
DROP POLICY IF EXISTS admin_audit_log_insert_staff ON public.admin_audit_log;
CREATE POLICY admin_audit_log_insert_staff
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    admin_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'staff') OR p.is_staff = TRUE)
    )
  );

COMMENT ON TABLE public.admin_audit_log IS 'CID Connect admin actions for compliance review.';
