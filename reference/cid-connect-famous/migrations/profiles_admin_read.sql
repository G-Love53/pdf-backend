-- Allow staff/admin to list profiles for User Management tab (adjust to your schema)

-- Example: staff can read all profiles (sensitive — only enable if intended)
DROP POLICY IF EXISTS profiles_select_staff ON public.profiles;
CREATE POLICY profiles_select_staff
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'staff') OR p.is_staff = TRUE)
    )
  );

-- Updates to role: only admin (tighten as needed)
DROP POLICY IF EXISTS profiles_update_admin_role ON public.profiles;
CREATE POLICY profiles_update_admin_role
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
