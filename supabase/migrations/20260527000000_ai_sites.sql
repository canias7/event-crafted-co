-- AI website builder: generated sites live here. Anonymous-friendly
-- for testing (no owner column yet) — wire to auth.uid() in a follow-up
-- when we add sign-in. Inserts happen server-side via service role,
-- so no INSERT policy. Public can read so /s/<slug> works.

CREATE TABLE IF NOT EXISTS public.ai_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  html TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_sites_slug_idx ON public.ai_sites (slug);
CREATE INDEX IF NOT EXISTS ai_sites_created_at_idx ON public.ai_sites (created_at DESC);

ALTER TABLE public.ai_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_sites public read" ON public.ai_sites;
CREATE POLICY "ai_sites public read"
  ON public.ai_sites
  FOR SELECT
  USING (true);

-- Atomic view counter so we don't lose hits under concurrent reads.
CREATE OR REPLACE FUNCTION public.ai_sites_increment_view(p_slug TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ai_sites
     SET view_count = view_count + 1
   WHERE slug = p_slug;
$$;

GRANT EXECUTE ON FUNCTION public.ai_sites_increment_view(TEXT) TO anon, authenticated;
