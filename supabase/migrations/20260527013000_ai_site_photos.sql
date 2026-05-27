-- Photo album: guest-uploaded photos that appear in __PHOTO_ALBUM__
-- placeholder on the public site. Approved-only public reads; the
-- owner of the parent site moderates and deletes.

CREATE TABLE IF NOT EXISTS public.ai_site_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.ai_sites(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  uploader_name text,
  caption text,
  approved boolean NOT NULL DEFAULT true,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_site_photos_site_idx
  ON public.ai_site_photos(site_id, uploaded_at DESC);

ALTER TABLE public.ai_site_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_site_photos_public_read ON public.ai_site_photos;
CREATE POLICY ai_site_photos_public_read ON public.ai_site_photos
  FOR SELECT USING (approved = true);

DROP POLICY IF EXISTS ai_site_photos_owner_manage ON public.ai_site_photos;
CREATE POLICY ai_site_photos_owner_manage ON public.ai_site_photos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_sites s
      WHERE s.id = ai_site_photos.site_id
        AND (s.owner_user_id = auth.uid() OR s.owner_user_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_sites s
      WHERE s.id = ai_site_photos.site_id
        AND (s.owner_user_id = auth.uid() OR s.owner_user_id IS NULL)
    )
  );
