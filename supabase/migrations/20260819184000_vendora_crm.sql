-- Vendora CRM — the Pro-plan "Access to Vendora CRM" perk, made real.
-- A client is any host who has inquired with one of the vendor's
-- listings. Vendors on Pro+ get: the aggregated client list, a notes
-- timeline per client, and a follow-up reminder that lands as an
-- in-app notification + push when due.

-- ============================================================
-- 1. Gate helper: Pro and up (Premium keeps the 'studio' slug)
-- ============================================================
create or replace function public.is_pro_user(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id
      and (subscription_tier in ('pro', 'studio')
           or unlimited_listings = true)
  );
$$;
grant execute on function public.is_pro_user(uuid) to authenticated;

-- ============================================================
-- 2. Notes timeline per client
-- ============================================================
create table if not exists public.vendor_crm_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  host_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists vendor_crm_notes_idx
  on public.vendor_crm_notes (user_id, host_id, created_at desc);
alter table public.vendor_crm_notes enable row level security;
drop policy if exists "crm_notes_owner_all" on public.vendor_crm_notes;
create policy "crm_notes_owner_all" on public.vendor_crm_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 3. Per-client meta: one follow-up reminder at a time
-- ============================================================
create table if not exists public.vendor_crm_meta (
  user_id uuid not null references auth.users(id) on delete cascade,
  host_id uuid not null,
  follow_up_at timestamptz,
  follow_up_note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, host_id)
);
alter table public.vendor_crm_meta enable row level security;
drop policy if exists "crm_meta_owner_all" on public.vendor_crm_meta;
create policy "crm_meta_owner_all" on public.vendor_crm_meta
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 4. Client list RPC (Pro+ only) — aggregates the caller's inquiries
-- ============================================================
create or replace function public.vendor_crm_clients()
returns table (
  host_id uuid,
  host_name text,
  host_avatar text,
  inquiries_count int,
  booked_count int,
  first_inquiry_at timestamptz,
  last_activity_at timestamptz,
  next_event_date date,
  last_event_date date,
  follow_up_at timestamptz,
  follow_up_note text,
  notes_count int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  if not public.is_pro_user(auth.uid()) then
    raise exception 'crm_requires_pro: Vendora CRM is available on the Pro plan and up';
  end if;
  return query
  select
    i.host_id,
    coalesce(nullif(trim(p.display_name), ''), 'Vendora host') as host_name,
    p.avatar_url as host_avatar,
    count(*)::int as inquiries_count,
    count(*) filter (
      where i.status = 'won'
         or i.vendor_confirmed_booked_at is not null
         or i.paid_booked_at is not null
    )::int as booked_count,
    min(i.created_at) as first_inquiry_at,
    greatest(max(i.created_at), max(coalesce(i.last_message_at, i.created_at))) as last_activity_at,
    min(i.event_date) filter (where i.event_date >= current_date) as next_event_date,
    max(i.event_date) filter (where i.event_date < current_date) as last_event_date,
    m.follow_up_at,
    m.follow_up_note,
    (select count(*)::int from public.vendor_crm_notes n
      where n.user_id = auth.uid() and n.host_id = i.host_id) as notes_count
  from public.inquiries i
  join public.vendor_profiles vp on vp.id = i.vendor_id and vp.user_id = auth.uid()
  left join public.profiles p on p.id = i.host_id
  left join public.vendor_crm_meta m
    on m.user_id = auth.uid() and m.host_id = i.host_id
  group by i.host_id, p.display_name, p.avatar_url, m.follow_up_at, m.follow_up_note
  order by greatest(max(i.created_at), max(coalesce(i.last_message_at, i.created_at))) desc;
end;
$$;
grant execute on function public.vendor_crm_clients() to authenticated;

-- ============================================================
-- 5. Follow-up reminders → notifications (push fans out via the
--    existing notifications_fanout_push trigger). Fires once: the
--    reminder clears itself after sending.
-- ============================================================
create or replace function public.run_crm_reminders()
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_name text;
begin
  for r in
    select m.user_id, m.host_id, m.follow_up_note
      from public.vendor_crm_meta m
     where m.follow_up_at is not null
       and m.follow_up_at <= now()
       and public.is_pro_user(m.user_id)
     limit 200
  loop
    begin
      select coalesce(nullif(trim(display_name), ''), 'your client')
        into v_name from public.profiles where id = r.host_id;
      insert into public.notifications (user_id, type, title, body, link)
      values (
        r.user_id,
        'crm_follow_up',
        'Follow-up reminder',
        coalesce(nullif(trim(r.follow_up_note), ''),
                 'Time to follow up with ' || coalesce(v_name, 'your client') || '.'),
        '/vendor/crm'
      );
      update public.vendor_crm_meta
         set follow_up_at = null, follow_up_note = null, updated_at = now()
       where user_id = r.user_id and host_id = r.host_id;
    exception when others then
      -- one bad row must not block the rest of the sweep
      null;
    end;
  end loop;
end;
$$;

do $$
begin
  perform cron.unschedule('crm-reminders-hourly');
exception when others then
  null;
end;
$$;
select cron.schedule('crm-reminders-hourly', '35 * * * *', 'select public.run_crm_reminders()');
