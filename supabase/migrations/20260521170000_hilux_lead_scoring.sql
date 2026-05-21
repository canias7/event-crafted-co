-- HILUX lead scoring: after every host message that HILUX
-- processes, classify the inquiry's current temperature so the
-- vendor can triage their inbox at a glance.
--
-- Score lives on inquiries (not direct_threads) because the score
-- attaches to the structured lead, and a single inquiry has exactly
-- one thread. Casual DM threads without an inquiry row are skipped.

alter table public.inquiries
  add column if not exists lead_score text
    check (lead_score in ('hot', 'warm', 'cold', 'unknown'));

alter table public.inquiries
  add column if not exists lead_score_reason text;

alter table public.inquiries
  add column if not exists lead_score_updated_at timestamptz;

create index if not exists inquiries_lead_score_idx
  on public.inquiries (lead_score)
  where lead_score is not null;
