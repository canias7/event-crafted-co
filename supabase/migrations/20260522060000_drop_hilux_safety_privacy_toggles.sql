-- Bake the four HILUX "Safety & privacy" toggles into the agent's
-- default behavior rather than vendor-tunable switches. These are
-- guardrails that should always hold, not options:
--
--   refuse_legal              — never discuss contracts / legal terms
--   refuse_competitor_pricing — never price-match or compare to rivals
--   no_other_clients          — never reference other clients
--   redact_contact            — never write a phone / email / URL

alter table public.profiles
  drop column if exists hilux_action_refuse_legal,
  drop column if exists hilux_action_refuse_competitor_pricing,
  drop column if exists hilux_action_no_other_clients,
  drop column if exists hilux_action_redact_contact;
