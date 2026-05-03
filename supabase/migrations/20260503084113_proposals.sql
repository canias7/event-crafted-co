-- Proposals: vendor sends a structured quote on an inquiry; host accepts
-- or rejects. Accepting flips the parent inquiry to 'won'.

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  line_items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0,
  deposit_cents integer,
  terms text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  sent_at timestamptz default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proposals_inquiry_idx on public.proposals (inquiry_id, created_at desc);
create index proposals_vendor_idx on public.proposals (vendor_id, status);

alter table public.proposals enable row level security;

-- Both parties on the inquiry can read all proposals on it
create policy "proposals participants select"
  on public.proposals for select
  to authenticated
  using (
    auth.uid() = host_id
    or exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

-- Vendor on the inquiry can insert
create policy "proposals vendor insert"
  on public.proposals for insert
  to authenticated
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

-- Vendor on the inquiry can update / withdraw
create policy "proposals vendor update"
  on public.proposals for update
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

-- Host on the inquiry can update their accept / reject status
create policy "proposals host update"
  on public.proposals for update
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create trigger proposals_updated
  before update on public.proposals
  for each row execute function public.tg_set_updated_at();

-- Notify host when a vendor sends a proposal
create or replace function public.notify_proposal_sent()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_vendor_name text;
begin
  select coalesce(business_name, 'A vendor') into v_vendor_name
    from public.vendor_profiles where id = new.vendor_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.host_id,
    'proposal_sent',
    v_vendor_name || ' sent a proposal',
    'Tap to review and accept or counter.',
    '/customer/inquiries/' || new.inquiry_id::text
  );
  return new;
end$$;

create trigger proposals_notify_sent
  after insert on public.proposals
  for each row execute function public.notify_proposal_sent();

-- When a host accepts, also flip the inquiry to won (idempotent)
create or replace function public.accept_proposal_side_effects()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_vendor_user uuid;
  v_vendor_name text;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    update public.inquiries
      set status = 'won'
      where id = new.inquiry_id and status <> 'won';

    select vp.user_id, vp.business_name into v_vendor_user, v_vendor_name
      from public.vendor_profiles vp where vp.id = new.vendor_id;
    if v_vendor_user is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_vendor_user,
        'proposal_accepted',
        'Proposal accepted',
        'Your proposal was accepted — the inquiry is now booked.',
        '/vendor/inbox/' || new.inquiry_id::text
      );
    end if;
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    select vp.user_id into v_vendor_user
      from public.vendor_profiles vp where vp.id = new.vendor_id;
    if v_vendor_user is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_vendor_user,
        'proposal_rejected',
        'Proposal declined',
        'The host declined your proposal. You can send a revised one.',
        '/vendor/inbox/' || new.inquiry_id::text
      );
    end if;
  end if;
  return new;
end$$;

create trigger proposals_status_side_effects
  after update of status on public.proposals
  for each row execute function public.accept_proposal_side_effects();

revoke execute on function public.notify_proposal_sent() from public, anon, authenticated;
revoke execute on function public.accept_proposal_side_effects() from public, anon, authenticated;
