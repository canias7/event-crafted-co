-- AI Website Builder v3: image generation, OG tags, moderation flag.
--
-- 1. ai-site-images storage bucket (public read) — holds AI-generated
--    hero photos returned by ai-site-image-generate.
-- 2. is_blocked column on ai_sites — admins can flip to hide flagged
--    sites from the public renderer. Soft moderation switch.
-- 3. og_description on ai_sites — caches a short description we feed
--    into Open Graph + Twitter card meta tags when serving the
--    public route. NULL means "no description set; fall back to title."

ALTER TABLE public.ai_sites
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS og_description TEXT,
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

CREATE INDEX IF NOT EXISTS ai_sites_blocked_idx
  ON public.ai_sites (is_blocked) WHERE is_blocked = TRUE;

-- Storage bucket (public read; writes are service-role only — the
-- edge function is the sole producer).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('ai-site-images', 'ai-site-images', TRUE)
  ON CONFLICT (id) DO NOTHING;

-- Public read of the bucket.
DROP POLICY IF EXISTS "ai-site-images public read" ON storage.objects;
CREATE POLICY "ai-site-images public read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'ai-site-images');
