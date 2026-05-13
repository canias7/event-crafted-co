-- Outreach templates + per-lead send tracking.
--
-- email_templates: admin team writes once, reuses across many leads.
-- Body supports {{name}}, {{email}}, {{source}} placeholders that the
-- send-transactional-email edge function substitutes at send time.
--
-- email_leads.last_sent_at / last_template_id: lightweight per-row
-- "last contacted" telemetry so the leads table can show send state
-- without a separate history table for v1.

CREATE TABLE public.email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_by  UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_templates_created_at_idx
  ON public.email_templates (created_at DESC);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_templates_admin_read
  ON public.email_templates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY email_templates_admin_write
  ON public.email_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TRIGGER email_templates_set_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.email_leads
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_template_id UUID REFERENCES public.email_templates (id) ON DELETE SET NULL;
