-- Let vendors keep a personal calendar before they publish any listing.
-- Appointments can now belong either to a listing (vendor_id) or directly
-- to the vendor's account (owner_user_id) when there's no listing yet.

ALTER TABLE public.appointments ALTER COLUMN vendor_id DROP NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS appointments_owner_user_id_idx
  ON public.appointments(owner_user_id);

-- Every row must be reachable by someone: a listing or an account owner.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_vendor_or_owner_chk;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_vendor_or_owner_chk
  CHECK (vendor_id IS NOT NULL OR owner_user_id IS NOT NULL);

-- RLS: widen the vendor-side policies to also cover listing-less,
-- account-owned personal entries (vendor_id NULL + owner_user_id = me).
DROP POLICY IF EXISTS "appointments vendor insert" ON public.appointments;
CREATE POLICY "appointments vendor insert" ON public.appointments
  FOR INSERT
  WITH CHECK (
    (
      (vendor_id IS NOT NULL AND is_vendor_member(vendor_id))
      OR (vendor_id IS NULL AND owner_user_id = (SELECT auth.uid()))
    )
    AND proposed_by = 'vendor'
  );

DROP POLICY IF EXISTS "appointments select participants" ON public.appointments;
CREATE POLICY "appointments select participants" ON public.appointments
  FOR SELECT
  USING (
    ((SELECT auth.uid()) = host_id)
    OR (vendor_id IS NOT NULL AND is_vendor_member(vendor_id))
    OR (owner_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "appointments vendor update" ON public.appointments;
CREATE POLICY "appointments vendor update" ON public.appointments
  FOR UPDATE
  USING (
    (vendor_id IS NOT NULL AND is_vendor_member(vendor_id))
    OR (owner_user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (vendor_id IS NOT NULL AND is_vendor_member(vendor_id))
    OR (owner_user_id = (SELECT auth.uid()))
  );
