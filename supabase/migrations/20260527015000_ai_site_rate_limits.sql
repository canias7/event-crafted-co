-- Lightweight rate limit table for the AI Website Builder public
-- endpoints (RSVP submit, comment wall, photo upload). Keyed by
-- (ip, bucket); buckets look like "rsvp:<slug>" or "msg:<slug>".
-- A row's window_start is when its counter started; rows older
-- than their window are reset on next hit. Cleaned lazily.

CREATE TABLE IF NOT EXISTS public.ai_site_rate_limits (
  ip text NOT NULL,
  bucket text NOT NULL,
  hits int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip, bucket)
);

CREATE INDEX IF NOT EXISTS ai_site_rate_limits_window_idx
  ON public.ai_site_rate_limits(window_start);

ALTER TABLE public.ai_site_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service-role only — no client touches this directly.
DROP POLICY IF EXISTS ai_site_rate_limits_service ON public.ai_site_rate_limits;
CREATE POLICY ai_site_rate_limits_service ON public.ai_site_rate_limits
  FOR ALL USING (false) WITH CHECK (false);
