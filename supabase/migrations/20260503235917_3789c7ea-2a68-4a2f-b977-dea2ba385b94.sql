
-- Lock down search_path on remaining public functions
ALTER FUNCTION public.slugify_vendor_name(text) SET search_path = public;
ALTER FUNCTION public.tg_set_calendar_feed_token() SET search_path = public;
ALTER FUNCTION public.tg_set_vendor_slug() SET search_path = public;

-- Tighten the always-true INSERT policy on vendor_profile_views so anonymous
-- traffic can only log a view for a vendor that actually exists.
DROP POLICY IF EXISTS "vendor_profile_views public insert" ON public.vendor_profile_views;
CREATE POLICY "vendor_profile_views insert valid vendor"
  ON public.vendor_profile_views
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.vendor_profiles vp WHERE vp.id = vendor_profile_views.vendor_id)
    AND (viewer_id IS NULL OR viewer_id = auth.uid())
  );
