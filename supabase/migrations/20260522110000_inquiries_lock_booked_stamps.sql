-- Security fix (S1): a host or vendor could rewrite ANY column on
-- their own inquiry. The `inquiries host update` / `inquiries vendor
-- update` RLS policies have no WITH CHECK clause, so Postgres reuses
-- USING — which only verifies row ownership, never which columns
-- change. Either party could therefore write BOTH booking-
-- confirmation stamps directly, bypassing the two-sided
-- mark_inquiry_booked handshake, and post a fabricated event review
-- against a counterparty they never worked with. Migration
-- 20260520040000 calls two-sided confirmation "non-negotiable"
-- precisely to prevent this.
--
-- Fix: revoke table-wide UPDATE from `authenticated` and re-grant it
-- on every column EXCEPT the two booked-at stamps. The stamps become
-- writable only through mark_inquiry_booked, which is switched to
-- SECURITY DEFINER so it still can. The RPC already infers the
-- caller's side from auth.uid(), so each party can still only stamp
-- its own side — the handshake is preserved, the bypass is closed.

revoke update on public.inquiries from authenticated;

grant update (
  id, host_id, vendor_id, event_type, event_date, guest_count,
  location, budget_min_cents, budget_max_cents, special_requests,
  status, quality_score, intent_score, recommended_verification,
  created_at, updated_at, review_prompt_sent_at, intake_answers,
  vendor_read_at, host_read_at, package_id, last_message_at
) on public.inquiries to authenticated;

create or replace function public.mark_inquiry_booked(p_inquiry_id uuid)
returns public.inquiries
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inquiry public.inquiries;
  v_is_host boolean;
  v_is_vendor boolean;
begin
  select * into v_inquiry from public.inquiries where id = p_inquiry_id;
  if v_inquiry.id is null then
    raise exception 'not_found';
  end if;

  v_is_host := (select auth.uid()) = v_inquiry.host_id;
  v_is_vendor := public.is_vendor_member(v_inquiry.vendor_id);

  if not v_is_host and not v_is_vendor then
    raise exception 'not_authorized';
  end if;

  if v_is_host then
    update public.inquiries
       set host_confirmed_booked_at = coalesce(host_confirmed_booked_at, now())
     where id = p_inquiry_id
     returning * into v_inquiry;
  elsif v_is_vendor then
    update public.inquiries
       set vendor_confirmed_booked_at = coalesce(vendor_confirmed_booked_at, now())
     where id = p_inquiry_id
     returning * into v_inquiry;
  end if;

  return v_inquiry;
end
$$;
