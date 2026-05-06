create table if not exists public.vendor_availability_rules (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
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

create index if not exists vendor_availability_rules_vendor_idx
  on public.vendor_availability_rules (vendor_id);

alter table public.vendor_availability_rules enable row level security;

drop policy if exists "availability_rules public read" on public.vendor_availability_rules;
create policy "availability_rules public read"
  on public.vendor_availability_rules for select using (true);

drop policy if exists "availability_rules owner write" on public.vendor_availability_rules;
create policy "availability_rules owner write"
  on public.vendor_availability_rules for all to authenticated
  using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()))
  with check (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));

drop trigger if exists vendor_availability_rules_updated on public.vendor_availability_rules;
create trigger vendor_availability_rules_updated
  before update on public.vendor_availability_rules
  for each row execute function public.tg_set_updated_at();

alter table public.vendor_profiles
  add column if not exists appointment_buffer_before_minutes integer not null default 0
    check (appointment_buffer_before_minutes between 0 and 240);

alter table public.vendor_profiles
  add column if not exists appointment_buffer_after_minutes integer not null default 15
    check (appointment_buffer_after_minutes between 0 and 240);

create or replace function public.get_vendor_availability(p_vendor_id uuid, p_date date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare rule_row public.vendor_availability_rules; blocked boolean;
begin
  select exists(select 1 from public.vendor_unavailable_dates where vendor_id = p_vendor_id and date = p_date) into blocked;
  if blocked then return jsonb_build_object('available', false, 'reason', 'blocked'); end if;
  select * into rule_row from public.vendor_availability_rules where vendor_id = p_vendor_id and day_of_week = extract(dow from p_date)::int;
  if rule_row.id is null then return jsonb_build_object('available', true); end if;
  if rule_row.is_unavailable then return jsonb_build_object('available', false, 'reason', 'recurring_off'); end if;
  return jsonb_build_object('available', true, 'start_time', rule_row.start_time, 'end_time', rule_row.end_time);
end;
$$;

grant execute on function public.get_vendor_availability(uuid, date) to anon, authenticated;