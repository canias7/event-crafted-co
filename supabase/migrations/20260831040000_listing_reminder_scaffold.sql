-- Scaffolding for "your listing isn't finished" reminder emails.
-- Built deliberately in a state that CANNOT send: the scanner defaults
-- to dry-run and nothing is scheduled. Flipping it live is a separate,
-- explicit act.

-- Server-side mirror of apps/vendor-mobile/lib/setupChecklist.ts. One
-- row per vendor owner with the same eight required flags the app's
-- "You're almost live!" banner counts, so an email can never claim a
-- step is missing that the app shows as done.
--
-- No email column on purpose: the view is readable by the app, and the
-- scanner (service role) joins auth.users itself.
create or replace view public.vendor_setup_status
with (security_invoker = true) as
with primary_listing as (
  select distinct on (user_id)
    user_id, business_name, logo_url, bio, created_at
  from public.vendor_profiles
  order by user_id, created_at asc
), agg as (
  select
    v.user_id,
    min(v.created_at) as first_listing_at,
    bool_or(nullif(btrim(coalesce(v.category, '')), '') is not null) as any_category,
    bool_or(nullif(btrim(coalesce(v.location, '')), '') is not null) as any_location,
    -- custom_pricing is a BOOLEAN. The client checklist ran it through a
    -- string-emptiness helper, so "custom pricing" never counted and the
    -- vendor was told their pricing was unfinished forever.
    bool_or(
      v.price_min_cents is not null
      or v.base_price_cents is not null
      or v.custom_pricing is true
      or coalesce(array_length(v.pricing_models, 1), 0) > 0
    ) as any_pricing,
    bool_or(v.application_status in ('approved', 'pending', 'submitted')) as any_published,
    bool_or(
      exists (select 1 from public.vendor_availability_rules r where r.vendor_id = v.id)
      or exists (select 1 from public.vendor_unavailable_dates d where d.vendor_id = v.id)
    ) as any_availability
  from public.vendor_profiles v
  where v.user_id is not null
  group by v.user_id
)
select
  a.user_id,
  a.first_listing_at,
  coalesce(
    nullif(btrim(coalesce(p.business_name, pl.business_name, '')), ''),
    '(unnamed)'
  ) as business_name,
  (nullif(btrim(coalesce(p.business_name, pl.business_name, '')), '') is not null) as has_identity,
  (nullif(btrim(coalesce(p.logo_url, pl.logo_url, '')), '') is not null) as has_logo,
  (nullif(btrim(coalesce(p.bio, pl.bio, '')), '') is not null) as has_description,
  (nullif(btrim(coalesce(p.category, '')), '') is not null or a.any_category) as has_category,
  (nullif(btrim(coalesce(p.location, '')), '') is not null or a.any_location) as has_location,
  a.any_pricing as has_pricing,
  a.any_published as has_published_listing,
  a.any_availability as has_availability
from agg a
left join public.profiles p on p.id = a.user_id
left join primary_listing pl on pl.user_id = a.user_id;

comment on view public.vendor_setup_status is
  'Server-side mirror of the vendor setup checklist. Source of truth for listing-completion reminders.';

-- Every scan writes here, dry-run included, so there is a record of who
-- WOULD have been mailed before anything is ever actually sent.
create table if not exists public.listing_reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  missing text[] not null default '{}',
  -- false only when a send genuinely happened
  dry_run boolean not null default true,
  sent_at timestamptz,
  skipped_reason text,
  created_at timestamptz not null default now()
);

create index if not exists listing_reminder_log_user_idx
  on public.listing_reminder_log (user_id, created_at desc);
create index if not exists listing_reminder_log_sent_idx
  on public.listing_reminder_log (sent_at desc) where sent_at is not null;

-- RLS on with no policies: service role only. Nothing in the client
-- needs to read this.
alter table public.listing_reminder_log enable row level security;
