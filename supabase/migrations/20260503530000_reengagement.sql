-- Vendor re-engagement: nudge vendors to reach out to past clients
-- around meaningful anniversaries (1-year, 2-year, 5-year) so they
-- can pitch a follow-on event — anniversary photo session, milestone
-- party, holiday rebooking. Drives vendor LTV without any vendor
-- effort.
--
-- A daily cron job invokes the scan-reengagement-opportunities edge
-- function which calls enqueue_reengagement_opportunities() to find
-- new matches, dedupes via vendor_reengagement_log, then sends one
-- email + in-app notification per opportunity.

create table public.vendor_reengagement_log (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  occasion text not null,            -- e.g. "anniversary_1y", "anniversary_2y"
  event_type text,
  upcoming_date date not null,       -- the date we're nudging about
  notified_at timestamptz not null default now(),
  -- One nudge per (vendor, host, inquiry, occasion). Trying to send
  -- the same anniversary twice silently fails the unique constraint.
  unique (vendor_id, host_id, inquiry_id, occasion)
);

create index vendor_reengagement_log_vendor_idx
  on public.vendor_reengagement_log (vendor_id, notified_at desc);

alter table public.vendor_reengagement_log enable row level security;

create policy "vendor_reengagement_log vendor read"
  on public.vendor_reengagement_log for select to authenticated
  using (public.is_vendor_member(vendor_id));

-- Vendor preference column on profiles. Default ON; vendors can opt
-- out from Settings or via the unsubscribe footer.
alter table public.profiles
  add column if not exists reengagement_emails_enabled boolean
    not null default true;

-- Returns rows ready to be processed: past won inquiries whose
-- event_date hits one of the anniversary windows ~30 days out.
-- The edge function picks these up, sends emails, then writes to
-- vendor_reengagement_log so the same row doesn't fire next day.
--
-- Anniversary cadence:
--   1-year  → after the first anniversary
--   2-year  → after the second
--   5-year  → milestone
-- Window: target_date is between today + 25d and today + 35d (so the
-- daily cron has 10 days to catch it even if it skips a run).
create or replace function public.find_reengagement_opportunities()
returns table (
  vendor_id uuid,
  host_id uuid,
  inquiry_id uuid,
  occasion text,
  event_type text,
  upcoming_date date,
  vendor_user_id uuid,
  vendor_business_name text,
  host_email text,
  host_display_name text
)
language sql stable security definer set search_path = public
as $$
  with windows as (
    select
      occasion,
      years_offset
    from (values
      ('anniversary_1y', 1),
      ('anniversary_2y', 2),
      ('anniversary_5y', 5)
    ) as w(occasion, years_offset)
  ),
  opportunities as (
    select
      i.vendor_id,
      i.host_id,
      i.id as inquiry_id,
      w.occasion,
      i.event_type,
      (i.event_date + (w.years_offset || ' years')::interval)::date as upcoming_date,
      vp.user_id as vendor_user_id,
      vp.business_name as vendor_business_name,
      au.email as host_email,
      p.display_name as host_display_name
    from public.inquiries i
    cross join windows w
    join public.vendor_profiles vp on vp.id = i.vendor_id
    join public.profiles p on p.id = i.host_id
    left join auth.users au on au.id = i.host_id
    where i.status = 'won'
      and i.event_date is not null
      and (i.event_date + (w.years_offset || ' years')::interval)::date
          between current_date + interval '25 days'
          and current_date + interval '35 days'
      and not exists (
        select 1 from public.vendor_reengagement_log lg
        where lg.vendor_id = i.vendor_id
          and lg.host_id = i.host_id
          and lg.inquiry_id = i.id
          and lg.occasion = w.occasion
      )
      -- Respect vendor opt-out at the vendor's auth.user level.
      and exists (
        select 1 from public.profiles vp_owner
        where vp_owner.id = vp.user_id
          and coalesce(vp_owner.reengagement_emails_enabled, true) = true
      )
  )
  select * from opportunities;
$$;

revoke execute on function public.find_reengagement_opportunities() from public, anon, authenticated;
