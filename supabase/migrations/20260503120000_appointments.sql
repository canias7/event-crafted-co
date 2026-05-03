-- Appointments: scheduled meetings between a host and a vendor — consults,
-- walkthroughs, tastings, fittings, etc. Either side can propose; the
-- other accepts/declines. Optionally tied to an inquiry for context.
--
-- Status flow:
--   proposed  → accepted | declined | cancelled
--   accepted  → cancelled | completed
--   declined / cancelled / completed are terminal.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references public.inquiries(id) on delete set null,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'consultation'
    check (kind in ('consultation','walkthrough','tasting','fitting','phone_call','other')),
  title text,
  location text,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 60,
  status text not null default 'proposed'
    check (status in ('proposed','accepted','declined','cancelled','completed')),
  proposed_by text not null check (proposed_by in ('host','vendor')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_host_idx
  on public.appointments (host_id, scheduled_at desc);

create index appointments_vendor_idx
  on public.appointments (vendor_id, scheduled_at desc);

create index appointments_status_idx
  on public.appointments (status);

alter table public.appointments enable row level security;

-- Both parties can read their appointments. Vendor side resolves through
-- team membership so all teammates see them.
create policy "appointments select participants"
  on public.appointments for select
  to authenticated
  using (
    auth.uid() = host_id
    or public.is_vendor_member(vendor_id)
  );

-- Hosts insert proposals to vendors they're inquiring with (any vendor;
-- enforce they own the host_id).
create policy "appointments host insert"
  on public.appointments for insert
  to authenticated
  with check (
    auth.uid() = host_id
    and proposed_by = 'host'
  );

-- Vendor team members insert proposals to hosts they have an inquiry with.
create policy "appointments vendor insert"
  on public.appointments for insert
  to authenticated
  with check (
    public.is_vendor_member(vendor_id)
    and proposed_by = 'vendor'
  );

-- Either party can update (status changes mostly). Host can change status
-- on appointments where they are the host; vendor team likewise.
create policy "appointments host update"
  on public.appointments for update
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create policy "appointments vendor update"
  on public.appointments for update
  to authenticated
  using (public.is_vendor_member(vendor_id))
  with check (public.is_vendor_member(vendor_id));

create trigger appointments_updated
  before update on public.appointments
  for each row execute function public.tg_set_updated_at();

-- Notify the recipient when an appointment is proposed.
create or replace function public.notify_appointment_proposed()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_recipient uuid;
  v_proposer_name text;
  v_kind_label text;
  v_when text;
begin
  v_kind_label := replace(new.kind, '_', ' ');
  v_when := to_char(new.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC';

  if new.proposed_by = 'vendor' then
    v_recipient := new.host_id;
    select coalesce(business_name, 'A vendor') into v_proposer_name
      from public.vendor_profiles where id = new.vendor_id;
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_recipient,
      'appointment_proposed',
      v_proposer_name || ' proposed a ' || v_kind_label,
      v_when || ' — tap to accept or decline.',
      '/customer/appointments'
    );
  else
    select coalesce(p.display_name, 'A host') into v_proposer_name
      from public.profiles p where p.id = new.host_id;
    -- Notify each vendor team member.
    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'appointment_proposed',
      v_proposer_name || ' proposed a ' || v_kind_label,
      v_when || ' — tap to accept or decline.',
      '/vendor/appointments'
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id;
  end if;

  return new;
end$$;

create trigger appointments_notify_proposed
  after insert on public.appointments
  for each row execute function public.notify_appointment_proposed();

-- Notify the proposer when status changes (accepted/declined/cancelled).
create or replace function public.notify_appointment_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_recipient uuid;
  v_actor_name text;
  v_kind_label text;
  v_link text;
  v_actor_side text;
begin
  if new.status = old.status then
    return new;
  end if;

  v_kind_label := replace(new.kind, '_', ' ');

  -- Determine who acted. The actor is whichever side is NOT the proposer
  -- (since the proposer already knows). For 'cancelled' either side may
  -- act; we figure that out from auth.uid().
  v_actor_side := case
    when auth.uid() = new.host_id then 'host'
    when public.is_vendor_member(new.vendor_id) then 'vendor'
    else null
  end;

  if v_actor_side = 'host' then
    -- Vendor team gets the notification.
    select coalesce(p.display_name, 'The host') into v_actor_name
      from public.profiles p where p.id = new.host_id;
    v_link := '/vendor/appointments';
    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'appointment_' || new.status,
      v_actor_name || ' ' || new.status || ' the ' || v_kind_label,
      to_char(new.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC',
      v_link
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id;
  elsif v_actor_side = 'vendor' then
    -- Host gets the notification.
    select coalesce(business_name, 'The vendor') into v_actor_name
      from public.vendor_profiles where id = new.vendor_id;
    v_link := '/customer/appointments';
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.host_id,
      'appointment_' || new.status,
      v_actor_name || ' ' || new.status || ' the ' || v_kind_label,
      to_char(new.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC',
      v_link
    );
  end if;

  return new;
end$$;

create trigger appointments_notify_status
  after update of status on public.appointments
  for each row execute function public.notify_appointment_status();
