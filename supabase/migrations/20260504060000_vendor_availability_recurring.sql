-- Vendor availability: extend the simple "block these specific dates"
-- model with two real-world patterns vendors actually need:
--
-- 1. Recurring weekly rules — "I never work Mondays" or "I'm only
--    available Fri-Sun." Stored per day-of-week so the app can
--    project them onto any future date.
--
-- 2. Buffer time around appointments — most vendors need travel /
--    setup time between bookings. Two int columns on the vendor
--    profile (minutes before + after); the appointment-booking flow
--    enforces them.
--
-- The original vendor_unavailable_dates table stays — it covers
-- one-off blocks (vacation, family commitment, etc.). The new
-- recurring rules are the templated layer on top.

create table if not exists public.vendor_availability_rules (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  -- 0 = Sunday, 6 = Saturday (matches JS Date.getDay()).
  day_of_week int not null check (day_of_week between 0 and 6),
  -- A single row per (vendor, day) describing the day's status.
  -- is_unavailable=true makes the whole day off; otherwise the
  -- start_time/end_time pair defines bookable hours (NULL → all-day
  -- available, the default).
  is_unavailable boolean not null default false,
  start_time time,
  end_time time,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, day_of_week),
  check (
    is_unavailable = true
    or (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index vendor_availability_rules_vendor_idx
  on public.vendor_availability_rules (vendor_id);

alter table public.vendor_availability_rules enable row level security;

create policy "availability_rules public read"
  on public.vendor_availability_rules for select using (true);

create policy "availability_rules owner write"
  on public.vendor_availability_rules for all to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create trigger vendor_availability_rules_updated
  before update on public.vendor_availability_rules
  for each row execute function public.tg_set_updated_at();

-- Buffer minutes around appointments. Default 15 minutes after each
-- so back-to-back bookings always leave breathing room — vendors
-- can override per-profile.
alter table public.vendor_profiles
  add column if not exists appointment_buffer_before_minutes integer
    not null default 0
    check (appointment_buffer_before_minutes between 0 and 240);

alter table public.vendor_profiles
  add column if not exists appointment_buffer_after_minutes integer
    not null default 15
    check (appointment_buffer_after_minutes between 0 and 240);

-- Helper: project a vendor's availability for a given date. Returns
-- jsonb { available, start_time, end_time, reason } so the
-- appointment booking UI can disable taken/blocked slots without
-- pulling all the rules client-side.
create or replace function public.get_vendor_availability(
  p_vendor_id uuid,
  p_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rule_row public.vendor_availability_rules;
  blocked boolean;
begin
  -- One-off blocks win — explicit unavailability beats the recurring
  -- rule for that date.
  select exists(
    select 1 from public.vendor_unavailable_dates
    where vendor_id = p_vendor_id and date = p_date
  ) into blocked;
  if blocked then
    return jsonb_build_object(
      'available', false,
      'reason', 'blocked'
    );
  end if;

  select * into rule_row
  from public.vendor_availability_rules
  where vendor_id = p_vendor_id
    and day_of_week = extract(dow from p_date)::int;

  if rule_row.id is null then
    -- No rule = all-day available. Standard default for vendors who
    -- haven't set up recurring rules yet.
    return jsonb_build_object('available', true);
  end if;

  if rule_row.is_unavailable then
    return jsonb_build_object(
      'available', false,
      'reason', 'recurring_off'
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'start_time', rule_row.start_time,
    'end_time', rule_row.end_time
  );
end;
$$;

grant execute on function public.get_vendor_availability(uuid, date)
  to anon, authenticated;
