-- Per-site moderation toggles. Default false (= auto-approve, current
-- behavior) so existing sites keep working. Owners can flip either
-- via the builder's Moderate dialog to require manual approval on
-- new guest content.

ALTER TABLE public.ai_sites
  ADD COLUMN IF NOT EXISTS require_message_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_photo_approval   boolean NOT NULL DEFAULT false;
