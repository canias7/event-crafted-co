-- Bidirectional reviews — Track A (conversation rating) +
-- Track B (event review with mutual blind reveal).
--
-- Schema additions:
--   • kind 'conversation' | 'event'        — which track
--   • rater_role 'host' | 'vendor'         — who's reviewing
--   • released_at timestamptz              — mutual blind reveal stamp
--
-- Two gates enforced by a BEFORE INSERT trigger:
--   • conversation: ≥6 messages in this inquiry's thread
--   • event: a proposal with status='accepted' for this inquiry +
--     inquiry.event_date < current_date - 3 days
--
-- An AFTER INSERT trigger checks if the OPPOSITE party has already
-- submitted the same kind for the same inquiry. If so, both rows
-- get released_at = now() and become publicly visible. Otherwise
-- the row stays unreleased; the public SELECT policy also surfaces
-- it after 14 days (one-sided window expiry) so silent counter-
-- parties don't permanently bury the other side's review.
--
-- Conversation reviews are NOT under mutual reveal — they're set
-- to released_at = now() at insert time. Volume is the trust
-- signal, not blindness.

alter table public.reviews
  add column if not exists kind text not null default 'event',
  add column if not exists rater_role text not null default 'host',
  add column if not exists released_at timestamptz;

-- CHECK constraints. Use NOT VALID + VALIDATE so we don't trip on
-- a row that somehow doesn't match.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reviews_kind_check'
  ) then
    alter table public.reviews
      add constraint reviews_kind_check check (kind in ('conversation', 'event'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'reviews_rater_role_check'
  ) then
    alter table public.reviews
      add constraint reviews_rater_role_check check (rater_role in ('host', 'vendor'));
  end if;
end $$;

-- Backfill existing rows. Pre-launch they're all host-side event
-- reviews and should be publicly visible.
update public.reviews
   set released_at = coalesce(released_at, created_at);

-- One review per (inquiry, rater_role, kind). Allows host +
-- vendor to each leave one conversation rating AND one event
-- review for the same inquiry — but not two of the same kind
-- from the same side.
create unique index if not exists reviews_unique_party_kind
  on public.reviews(inquiry_id, rater_role, kind);

-- ─── Gate trigger ──────────────────────────────────────────────
create or replace function public.tg_reviews_gate_and_release()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_thread_id uuid;
  v_msg_count int;
  v_event_date date;
  v_inquiry_host uuid;
  v_inquiry_vendor uuid;
  v_proposal_ok boolean;
begin
  select host_id, vendor_id, event_date
    into v_inquiry_host, v_inquiry_vendor, v_event_date
    from public.inquiries
   where id = new.inquiry_id;
  if v_inquiry_host is null then
    raise exception 'inquiry_not_found';
  end if;

  -- Identity: the rater_role must match the caller's actual side.
  if new.rater_role = 'host' then
    if new.host_id is null or new.host_id <> v_inquiry_host then
      raise exception 'host_mismatch';
    end if;
    if (select auth.uid()) <> v_inquiry_host then
      raise exception 'not_authorized';
    end if;
  elsif new.rater_role = 'vendor' then
    if new.vendor_id is null or new.vendor_id <> v_inquiry_vendor then
      raise exception 'vendor_mismatch';
    end if;
    if not public.is_vendor_member(v_inquiry_vendor) then
      raise exception 'not_authorized';
    end if;
  end if;

  if new.kind = 'conversation' then
    -- ≥6 messages in this inquiry's thread.
    select dt.id into v_thread_id
      from public.direct_threads dt where dt.inquiry_id = new.inquiry_id;
    if v_thread_id is null then
      raise exception 'no_thread';
    end if;
    select count(*) into v_msg_count
      from public.direct_messages where thread_id = v_thread_id;
    if v_msg_count < 6 then
      raise exception 'min_messages_required';
    end if;
    -- Conversation ratings are released immediately.
    new.released_at := coalesce(new.released_at, now());
  elsif new.kind = 'event' then
    -- Need an accepted proposal for this inquiry.
    select exists (
      select 1 from public.proposals
       where inquiry_id = new.inquiry_id and status = 'accepted'
    ) into v_proposal_ok;
    if not v_proposal_ok then
      raise exception 'no_accepted_proposal';
    end if;
    if v_event_date is null then
      raise exception 'no_event_date';
    end if;
    if v_event_date > current_date - interval '3 days' then
      raise exception 'event_too_recent';
    end if;
    -- released_at stays null; the AFTER INSERT trigger handles
    -- mutual release.
  end if;

  return new;
end
$$;

drop trigger if exists reviews_gate_and_release on public.reviews;
create trigger reviews_gate_and_release
  before insert on public.reviews
  for each row
  execute function public.tg_reviews_gate_and_release();

-- ─── Mutual release trigger (event only) ───────────────────────
create or replace function public.tg_reviews_mutual_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_other_role text;
begin
  if new.kind = 'event' and new.released_at is null then
    v_other_role := case
      when new.rater_role = 'host' then 'vendor'
      else 'host'
    end;
    if exists (
      select 1 from public.reviews
       where inquiry_id = new.inquiry_id
         and kind = 'event'
         and rater_role = v_other_role
    ) then
      -- Both parties submitted; release everyone now. Includes
      -- the row we just inserted (its released_at flips from
      -- null to now()).
      update public.reviews
         set released_at = now()
       where inquiry_id = new.inquiry_id
         and kind = 'event'
         and released_at is null;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists reviews_mutual_release on public.reviews;
create trigger reviews_mutual_release
  after insert on public.reviews
  for each row
  execute function public.tg_reviews_mutual_release();

-- ─── INSERT policy — replace host-only with party-aware ────────
drop policy if exists "reviews host insert" on public.reviews;
drop policy if exists "reviews participant insert" on public.reviews;
create policy "reviews participant insert"
  on public.reviews
  for insert
  with check (
    (
      rater_role = 'host'
      and (select auth.uid()) = host_id
      and exists (
        select 1 from public.inquiries i
         where i.id = inquiry_id and i.host_id = (select auth.uid())
      )
    )
    or (
      rater_role = 'vendor'
      and public.is_vendor_member(vendor_id)
      and exists (
        select 1 from public.inquiries i
         where i.id = inquiry_id and i.vendor_id = reviews.vendor_id
      )
    )
  );

-- ─── UPDATE policy — extend to either rater ────────────────────
drop policy if exists "reviews host update own" on public.reviews;
drop policy if exists "reviews rater update own" on public.reviews;
create policy "reviews rater update own"
  on public.reviews
  for update
  using (
    (rater_role = 'host' and (select auth.uid()) = host_id)
    or (rater_role = 'vendor' and public.is_vendor_member(vendor_id))
  )
  with check (
    (rater_role = 'host' and (select auth.uid()) = host_id)
    or (rater_role = 'vendor' and public.is_vendor_member(vendor_id))
  );

-- ─── DELETE policy — same shape ───────────────────────────────
drop policy if exists "reviews host delete own" on public.reviews;
drop policy if exists "reviews rater delete own" on public.reviews;
create policy "reviews rater delete own"
  on public.reviews
  for delete
  using (
    (rater_role = 'host' and (select auth.uid()) = host_id)
    or (rater_role = 'vendor' and public.is_vendor_member(vendor_id))
  );

-- ─── SELECT policy — gate on released_at + 14-day grace ────────
-- Publicly visible when:
--   • released_at is set (mutual reveal happened), OR
--   • the event review is older than 14 days (one-sided expiry),
--     so a silent counterparty can't permanently hide the other
--     side's review forever.
-- Plus: the rater always sees their own; the vendor on a listing
-- always sees reviews scoped to their listing (even unreleased)
-- so they can see their incoming pending reviews.
drop policy if exists "reviews public read" on public.reviews;
create policy "reviews public read"
  on public.reviews
  for select
  using (
    -- Public visibility
    (
      hidden_at is null
      and (
        released_at is not null
        or (kind = 'event' and created_at < (now() - interval '14 days'))
      )
    )
    -- Or the rater themselves (their own unreleased row)
    or ((rater_role = 'host' and (select auth.uid()) = host_id))
    or ((rater_role = 'vendor' and public.is_vendor_member(vendor_id)))
  );
