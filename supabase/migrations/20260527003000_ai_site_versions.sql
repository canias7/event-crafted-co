-- AI Website Builder v4: per-edit version snapshots so users can
-- "undo" via the chat ("revert", "go back", etc).
--
-- Every successful generate/edit inserts a row here. ai-site-revert
-- pops the second-newest row and writes its HTML back onto ai_sites.

CREATE TABLE IF NOT EXISTS public.ai_site_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.ai_sites(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  html TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT,
  og_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, version_number)
);

CREATE INDEX IF NOT EXISTS ai_site_versions_site_idx
  ON public.ai_site_versions (site_id, version_number DESC);

ALTER TABLE public.ai_site_versions ENABLE ROW LEVEL SECURITY;

-- Owners can read their own versions (for future "version history"
-- UI). Anonymous-site versions are service-role-only — they're
-- restored via the revert edge function which uses the service role.
DROP POLICY IF EXISTS "ai_site_versions owner read" ON public.ai_site_versions;
CREATE POLICY "ai_site_versions owner read"
  ON public.ai_site_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_sites s
       WHERE s.id = ai_site_versions.site_id
         AND s.owner_user_id = auth.uid()
    )
  );

-- Backfill: snapshot every existing ai_sites row as version 1 so
-- "undo" works even for sites generated before this migration.
INSERT INTO public.ai_site_versions (
  site_id, version_number, html, title, prompt, og_description, created_at
)
SELECT
  s.id,
  1,
  s.html,
  s.title,
  s.prompt,
  s.og_description,
  s.created_at
FROM public.ai_sites s
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_site_versions v
   WHERE v.site_id = s.id
);
