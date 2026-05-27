-- AI Website Builder v2: ownership, edits, RSVP collection, custom slugs.
--
-- 1. Owner column on ai_sites so signed-in users can see their sites
--    on /my-sites and rename slugs they own. NULL for anonymous tests.
-- 2. edit_count tracks how many times a site has been modified
--    (for analytics + maybe future undo).
-- 3. ai_site_rsvps captures responses from the generated <form>
--    inside each site. Site owner can read; public can insert
--    (form-submit flow, no auth on guest side).
-- 4. RPC ai_sites_rename for atomic slug change with conflict check.

-- ── ai_sites: owner + edit count ──────────────────────────────────
ALTER TABLE public.ai_sites
  ADD COLUMN IF NOT EXISTS owner_user_id UUID
    REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS ai_sites_owner_idx
  ON public.ai_sites (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- Owner can UPDATE their own sites (for slug rename + the
-- edge-function service-role bypass also works).
DROP POLICY IF EXISTS "ai_sites owner update" ON public.ai_sites;
CREATE POLICY "ai_sites owner update"
  ON public.ai_sites
  FOR UPDATE
  USING (auth.uid() IS NOT NULL AND owner_user_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND owner_user_id = auth.uid());

-- Owner can DELETE their own sites.
DROP POLICY IF EXISTS "ai_sites owner delete" ON public.ai_sites;
CREATE POLICY "ai_sites owner delete"
  ON public.ai_sites
  FOR DELETE
  USING (auth.uid() IS NOT NULL AND owner_user_id = auth.uid());

-- ── ai_site_rsvps: guest responses ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_site_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.ai_sites(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  attending TEXT NOT NULL CHECK (attending IN ('yes', 'no', 'maybe')),
  guests_count INTEGER NOT NULL DEFAULT 1 CHECK (guests_count BETWEEN 1 AND 20),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_site_rsvps_site_idx
  ON public.ai_site_rsvps (site_id, created_at DESC);

ALTER TABLE public.ai_site_rsvps ENABLE ROW LEVEL SECURITY;

-- Site owner can read their RSVPs. Anonymous-site RSVPs are
-- service-role-only (visible to no one through PostgREST, which is
-- fine for the testing flow — the edge function still saves them).
DROP POLICY IF EXISTS "ai_site_rsvps owner read" ON public.ai_site_rsvps;
CREATE POLICY "ai_site_rsvps owner read"
  ON public.ai_site_rsvps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_sites s
       WHERE s.id = ai_site_rsvps.site_id
         AND s.owner_user_id IS NOT NULL
         AND s.owner_user_id = auth.uid()
    )
  );

-- RSVPs are inserted via the ai-site-rsvp-submit edge function
-- (service role), so no INSERT policy needed.

-- ── slug rename RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_sites_rename(
  p_site_id UUID,
  p_new_slug TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_owner UUID;
BEGIN
  -- Auth: only the owner can rename.
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT owner_user_id INTO v_owner
  FROM public.ai_sites
  WHERE id = p_site_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;

  -- Normalize: lowercase, alphanumerics + dashes, trim, length cap.
  v_normalized := lower(p_new_slug);
  v_normalized := regexp_replace(v_normalized, '[^a-z0-9-]+', '-', 'g');
  v_normalized := regexp_replace(v_normalized, '-+', '-', 'g');
  v_normalized := regexp_replace(v_normalized, '^-+|-+$', '', 'g');

  IF length(v_normalized) < 3 OR length(v_normalized) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_length');
  END IF;

  -- Reserved slugs (route conflicts + anti-impersonation).
  IF v_normalized IN (
    'admin', 'api', 'app', 'auth', 'help', 'login', 'logout', 'me',
    'new', 'sign-in', 'sign-up', 'signup', 'signin', 'settings',
    'vendor', 'vendors', 'host', 'hosts', 'customer', 'explore',
    'website-builder', 'my-sites', 'press', 'privacy', 'terms',
    'changelog', 'status'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reserved');
  END IF;

  -- Try the rename; unique constraint will fail on collision.
  BEGIN
    UPDATE public.ai_sites
       SET slug = v_normalized, updated_at = now()
     WHERE id = p_site_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END;

  RETURN jsonb_build_object('ok', true, 'slug', v_normalized);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_sites_rename(UUID, TEXT) TO authenticated;

-- updated_at auto-refresh trigger.
CREATE OR REPLACE FUNCTION public.ai_sites_touch_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_sites_touch_updated_trg ON public.ai_sites;
CREATE TRIGGER ai_sites_touch_updated_trg
  BEFORE UPDATE ON public.ai_sites
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_sites_touch_updated();
