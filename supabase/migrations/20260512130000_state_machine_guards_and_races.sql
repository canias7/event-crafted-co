-- Round-3 audit fixes: state-machine guards, race conditions, and
-- the proposal-rejection pref-key typo.
--
-- (#1) accept_proposal_side_effects gated the proposal-rejected branch
--      on 'proposal_accepted' instead of 'proposal_rejected'. Users who
--      flipped the rejected pref off still got pinged. Also: take a
--      row-level lock on the proposal before reading old.status so two
--      concurrent UPDATEs serialize. Combined with the unique partial
--      index added below this guarantees one-winner semantics.
--
-- (#2) Unique partial index on proposals: at most one accepted proposal
--      per inquiry. Concurrent accept attempts → one succeeds, the
--      other fails with a unique violation (caller can re-fetch and
--      show "already accepted by teammate").
--
-- (#4) New trigger tg_proposals_update_guard:
--       - host_id / vendor_id / inquiry_id immutable
--       - terminal states (accepted / rejected / withdrawn) cannot
--         transition away (except admin / postgres / supabase_admin)
--       - non-host cannot set accepted or rejected
--       - non-vendor cannot set withdrawn
--
-- (#5) New trigger tg_appointments_update_guard:
--       - host_id / vendor_id / scheduled_at / kind immutable
--       - terminal states (declined / cancelled / completed) cannot
--         transition away
--
-- (#6) Unique partial index on appointments: at most one
--      (vendor_id, scheduled_at) where status in ('proposed','accepted').
--      Prevents the same vendor being double-booked.

------------------------------------------------------------------------
-- (#1) + (#2): proposal accept race + rejected pref key
------------------------------------------------------------------------
create or replace function public.accept_proposal_side_effects()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  -- Re-lock the row we're about to mutate. Hermes-style concurrent
  -- accepts will now serialize here; combined with the new unique
  -- partial index, the second writer raises a constraint violation.
  perform 1 from public.proposals where id = new.id for update;

  if new.status = 'accepted' and old.status <> 'accepted' then
    update public.inquiries
      set status = 'won'
      where id = new.inquiry_id and status <> 'won';

    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'proposal_accepted',
      'Proposal accepted',
      'Your proposal was accepted - the inquiry is now booked.',
      '/vendor/inbox/' || new.inquiry_id::text
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id
      and public.is_notif_enabled(m.user_id, 'proposal_accepted');

  elsif new.status = 'rejected' and old.status <> 'rejected' then
    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'proposal_rejected',
      'Proposal declined',
      'The host declined your proposal. You can send a revised one.',
      '/vendor/inbox/' || new.inquiry_id::text
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id
      and public.is_notif_enabled(m.user_id, 'proposal_rejected');
  end if;
  return new;
end$function$;

-- Unique partial index: only one accepted proposal per inquiry. Index
-- creation works because there is at most one accepted proposal per
-- inquiry today (would have failed otherwise).
create unique index if not exists proposals_one_accepted_per_inquiry
  on public.proposals (inquiry_id)
  where status = 'accepted';

------------------------------------------------------------------------
-- (#4) Proposal transition guard
------------------------------------------------------------------------
create or replace function public.tg_proposals_update_guard()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  -- DB-internal callers (triggers, scheduled jobs, admin SQL) bypass.
  if current_user = 'postgres'
     or current_user = 'supabase_admin'
     or pg_has_role(current_user, 'postgres', 'MEMBER') then
    return new;
  end if;

  -- Immutable identifiers.
  if new.host_id    is distinct from old.host_id    then raise exception 'proposals.host_id is immutable'; end if;
  if new.vendor_id  is distinct from old.vendor_id  then raise exception 'proposals.vendor_id is immutable'; end if;
  if new.inquiry_id is distinct from old.inquiry_id then raise exception 'proposals.inquiry_id is immutable'; end if;

  if new.status is distinct from old.status then
    -- Terminal states can only be reverted by an admin.
    if old.status in ('accepted','rejected','withdrawn') and not public.is_admin() then
      raise exception 'cannot change a terminal proposal status (was %)', old.status;
    end if;

    -- Host can move to accepted / rejected from a non-terminal state.
    -- Vendor (the proposer) can move to withdrawn. Nobody else gets
    -- to touch status.
    if new.status in ('accepted','rejected') then
      if auth.uid() is distinct from new.host_id and not public.is_admin() then
        raise exception 'only the host can set proposal status to %', new.status;
      end if;
    elsif new.status = 'withdrawn' then
      if not public.is_vendor_member(new.vendor_id) and not public.is_admin() then
        raise exception 'only the vendor can withdraw a proposal';
      end if;
    elsif new.status = 'pending' then
      -- Pending is only valid on INSERT; updating *into* pending is
      -- never legitimate (would be a replay attempt).
      raise exception 'cannot reset proposal status to pending';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists proposals_update_guard on public.proposals;
create trigger proposals_update_guard
  before update on public.proposals
  for each row execute function public.tg_proposals_update_guard();

revoke execute on function public.tg_proposals_update_guard()
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------
-- (#5) Appointment transition guard
------------------------------------------------------------------------
create or replace function public.tg_appointments_update_guard()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if current_user = 'postgres'
     or current_user = 'supabase_admin'
     or pg_has_role(current_user, 'postgres', 'MEMBER') then
    return new;
  end if;

  if new.host_id      is distinct from old.host_id      then raise exception 'appointments.host_id is immutable'; end if;
  if new.vendor_id    is distinct from old.vendor_id    then raise exception 'appointments.vendor_id is immutable'; end if;
  if new.kind         is distinct from old.kind         then raise exception 'appointments.kind is immutable'; end if;

  if new.status is distinct from old.status then
    if old.status in ('declined','cancelled','completed') and not public.is_admin() then
      raise exception 'cannot change a terminal appointment status (was %)', old.status;
    end if;
    -- Reverting from accepted -> proposed is a notification replay
    -- attempt; only forward moves allowed.
    if old.status = 'accepted' and new.status = 'proposed' then
      raise exception 'cannot revert appointment from accepted to proposed';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists appointments_update_guard on public.appointments;
create trigger appointments_update_guard
  before update on public.appointments
  for each row execute function public.tg_appointments_update_guard();

revoke execute on function public.tg_appointments_update_guard()
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------
-- (#6) Appointment double-booking prevention
------------------------------------------------------------------------
-- The same vendor cannot have two active (proposed / accepted)
-- appointments at the same scheduled_at. Cancelled / declined /
-- completed appointments don't count.
create unique index if not exists appointments_no_double_booking
  on public.appointments (vendor_id, scheduled_at)
  where status in ('proposed','accepted');
