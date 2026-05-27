-- This migration was applied via MCP. File mirrored for git history.
-- Plus-one + meal + comment-wall schema additions.

ALTER TABLE public.ai_site_rsvps
  ADD COLUMN IF NOT EXISTS plus_one_name text,
  ADD COLUMN IF NOT EXISTS plus_one_meal text,
  ADD COLUMN IF NOT EXISTS meal_choice text;

ALTER TABLE public.ai_site_guests
  ADD COLUMN IF NOT EXISTS plus_one_allowed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ai_site_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.ai_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  message text NOT NULL,
  approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_site_messages_site_idx
  ON public.ai_site_messages(site_id, created_at DESC);

ALTER TABLE public.ai_site_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_site_messages_public_read ON public.ai_site_messages;
CREATE POLICY ai_site_messages_public_read ON public.ai_site_messages
  FOR SELECT USING (approved = true);

DROP POLICY IF EXISTS ai_site_messages_owner_manage ON public.ai_site_messages;
CREATE POLICY ai_site_messages_owner_manage ON public.ai_site_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_sites s
      WHERE s.id = ai_site_messages.site_id
        AND (s.owner_user_id = auth.uid() OR s.owner_user_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_sites s
      WHERE s.id = ai_site_messages.site_id
        AND (s.owner_user_id = auth.uid() OR s.owner_user_id IS NULL)
    )
  );
