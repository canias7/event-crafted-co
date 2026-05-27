-- Guest list for personalized invitations on AI-built event sites.
-- Each row is one invited guest with a unique opaque token; the
-- public link /s/<slug>?g=<token> renders the site with the guest's
-- name greeted in the hero.

CREATE TABLE IF NOT EXISTS public.ai_site_guests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.ai_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_site_guests_site_idx ON public.ai_site_guests(site_id);
CREATE INDEX IF NOT EXISTS ai_site_guests_token_idx ON public.ai_site_guests(token);

ALTER TABLE public.ai_site_guests ENABLE ROW LEVEL SECURITY;

-- The owner of the parent site can manage their guest list. Anonymous
-- sites (owner_user_id IS NULL) are wide-open to anyone, matching the
-- rest of the builder flow.
DROP POLICY IF EXISTS ai_site_guests_owner ON public.ai_site_guests;
CREATE POLICY ai_site_guests_owner ON public.ai_site_guests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_sites s
      WHERE s.id = ai_site_guests.site_id
        AND (s.owner_user_id = auth.uid() OR s.owner_user_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_sites s
      WHERE s.id = ai_site_guests.site_id
        AND (s.owner_user_id = auth.uid() OR s.owner_user_id IS NULL)
    )
  );

-- Public read is NOT enabled — the renderer uses the service role to
-- look up by token, so guest details never leak to the client.
