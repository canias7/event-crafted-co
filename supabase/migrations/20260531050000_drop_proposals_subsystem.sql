-- Retire the payable-proposal subsystem.
--
-- Proposals were replaced by the Files-driven flow: vendors send
-- proposals/contracts as text documents from the chat "Send" menu and
-- collect money via Invoices + Pay Links only (the host can pay solely
-- when the vendor shares a link/invoice). The proposal payment path
-- (host Accept -> /pay/:proposalId -> webhook payment_status) is gone
-- from the app; the webhook + my-space-chat no longer reference proposals;
-- and the old proposal components / checkout pages are deleted.
--
-- ⚠️ DESTRUCTIVE + IRREVERSIBLE. This drops the proposals +
-- proposal_templates tables (including historical paid records) and the
-- proposal-only helper functions. Two functions on OTHER tables that
-- referenced proposals are rewritten first so the drop doesn't break
-- live features (reviews, weekly digests).
--
-- APPLY ORDER: runs AFTER the updated edge functions deploy
-- (vendorapay-webhook + my-space-chat no longer touch proposals). The
-- deploy-edge-functions CI runs on merge before this migration takes
-- effect, so charge.refunded / charge.disputed never query a dropped
-- table mid-flight.
--
-- KEPT intentionally: vendor_proposal_templates (new Files store),
-- vendor_contract_templates, vendor_document_defaults, invoices,
-- payment_links. Orphaned-but-harmless (no caller): vendorapay-charge,
-- stripe-create-checkout edge functions.

-- ── 1. Rewrite the reviews gate so it no longer reads proposals ──────
-- tg_reviews_gate_and_release is a trigger ON public.reviews. Its
-- event-review branch required an accepted proposal OR an off-platform
-- booking confirmation. Proposals are gone, so event-review eligibility
-- is now: both parties confirmed the off-platform booking AND the event
-- is ≥3 days past. (Matches the frontend RatingPromptStrip change.)
create or replace function public.tg_reviews_gate_and_release()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_thread_id uuid;
  v_msg_count int;
  v_event_date date;
  v_inquiry_host uuid;
  v_inquiry_vendor uuid;
  v_booked_offplatform boolean;
begin
  select host_id, vendor_id, event_date,
         host_confirmed_booked_at is not null
           and vendor_confirmed_booked_at is not null
    into v_inquiry_host, v_inquiry_vendor, v_event_date,
         v_booked_offplatform
    from public.inquiries
   where id = new.inquiry_id;
  if v_inquiry_host is null then
    raise exception 'inquiry_not_found';
  end if;

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
    new.released_at := coalesce(new.released_at, now());
  elsif new.kind = 'event' then
    -- Was: accepted proposal OR off-platform booking. Proposals retired,
    -- so off-platform booking confirmation is the sole engagement signal.
    if not coalesce(v_booked_offplatform, false) then
      raise exception 'no_accepted_proposal';
    end if;
    if v_event_date is null then
      raise exception 'no_event_date';
    end if;
    if v_event_date > current_date - interval '3 days' then
      raise exception 'event_too_recent';
    end if;
  end if;

  return new;
end
$function$;

-- ── 2. Rewrite the weekly-digest eligibility (drop proposals exists) ─
-- enqueue_vendor_weekly_digests gated eligibility on new inquiries OR
-- new proposals OR new reviews. Drop the proposals clause.
create or replace function public.enqueue_vendor_weekly_digests(p_window_days integer default 7)
returns table(vendor_id uuid, vendor_name text, recipient_email text, inquiries_new integer, inquiries_replied integer, bookings_new integer, reviews_new integer, median_response_hours numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_ids uuid[]; v_since timestamptz := now() - make_interval(days => p_window_days);
begin
  with eligible as (
    update public.vendor_profiles vp set weekly_digest_sent_at = now()
    where vp.weekly_digest_enabled = true
      and (vp.weekly_digest_sent_at is null or vp.weekly_digest_sent_at < (now() - interval '6 days'))
      and (exists (select 1 from public.inquiries where vendor_id = vp.id and created_at >= v_since)
        or exists (select 1 from public.reviews where vendor_id = vp.id and created_at >= v_since))
    returning vp.id
  ) select array_agg(id) into v_ids from eligible;
  if v_ids is null or array_length(v_ids, 1) = 0 then return; end if;
  return query
  with reply_times as (
    select i.vendor_id, i.id as inquiry_id, i.created_at as inquiry_at, min(m.created_at) as first_reply_at
    from public.inquiries i left join public.messages m on m.inquiry_id = i.id and m.sender_role = 'vendor'
    where i.vendor_id = any(v_ids) and i.created_at >= v_since
    group by i.id, i.vendor_id, i.created_at
  )
  select vp.id, vp.business_name, u.email,
    coalesce((select count(*)::int from public.inquiries where vendor_id = vp.id and created_at >= v_since), 0),
    coalesce((select count(*)::int from public.inquiries where vendor_id = vp.id and created_at >= v_since and status in ('replied', 'won')), 0),
    coalesce((select count(*)::int from public.inquiries where vendor_id = vp.id and created_at >= v_since and status = 'won'), 0),
    coalesce((select count(*)::int from public.reviews where vendor_id = vp.id and created_at >= v_since), 0),
    (select percentile_cont(0.5) within group (order by extract(epoch from (rt.first_reply_at - rt.inquiry_at)) / 3600.0)
     from reply_times rt where rt.vendor_id = vp.id and rt.first_reply_at is not null)
  from public.vendor_profiles vp left join auth.users u on u.id = vp.user_id where vp.id = any(v_ids);
end$function$;

-- ── 3. Drop the proposal-only helper functions (callers deleted) ────
drop function if exists public.get_proposal_by_share_token(text);
drop function if exists public.mark_proposal_viewed(uuid);
drop function if exists public.toggle_proposal_share(uuid, boolean);

-- ── 4. Drop the tables ──────────────────────────────────────────────
-- DROP TABLE automatically removes the table from the supabase_realtime
-- publication, so no explicit ALTER PUBLICATION is needed (and an explicit
-- one would ERROR if the table weren't a member — avoided).
-- CASCADE drops the 3 triggers on proposals + their functions
-- (accept_proposal_side_effects, proposals_protect_vendorapay_fields,
-- tg_proposals_update_guard) and any remaining dependents.
drop table if exists public.proposals cascade;
drop table if exists public.proposal_templates cascade;
