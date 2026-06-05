-- Enforce at the DB level: a listing can't go LIVE ('approved') without
-- at least 3 portfolio photos. The listing wizard already requires this
-- in the UI (MIN_PHOTOS = 3), but direct/bulk inserts bypassed it — which
-- is how 100 photoless 'approved' listings got created.
--
-- Scope (deliberately narrow so we don't break anything):
--   • Fires only when a listing BECOMES 'approved' — i.e. inserted as
--     'approved', or transitioned into 'approved' from another status.
--   • Editing a row that's ALREADY 'approved' is untouched, so the
--     existing photoless listings are grandfathered and stay editable.
--   • 'draft' / 'pending' / 'rejected' are unaffected (the wizard creates
--     a draft first, uploads photos, then promotes).
--
-- Net effect: the only path to a live listing is draft -> add photos ->
-- approve, exactly like the UI. A one-shot insert as 'approved' (no
-- photos can exist yet for a brand-new id) is rejected.

create or replace function public.enforce_listing_min_photos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min constant int := 3;
  v_count int;
begin
  if new.application_status = 'approved'
     and (tg_op = 'INSERT'
          or old.application_status is distinct from 'approved') then
    select count(*) into v_count
      from public.vendor_portfolio_images
     where vendor_id = new.id;
    if v_count < v_min then
      raise exception
        'Listing cannot go live without at least % photos (has %).',
        v_min, v_count
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_listing_min_photos()
  from public, anon, authenticated;

drop trigger if exists trg_enforce_listing_min_photos on public.vendor_profiles;
create trigger trg_enforce_listing_min_photos
  before insert or update on public.vendor_profiles
  for each row execute function public.enforce_listing_min_photos();
