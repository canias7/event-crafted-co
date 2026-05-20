-- Generalize review_responses so either party can respond to a
-- review of them. Today the table is structurally vendor-only —
-- vendor_id NOT NULL, RLS keyed on vendor_profiles ownership — so
-- when a vendor rates a host (rater_role='vendor'), the host has
-- no reply surface even though the schema is one column away from
-- symmetric.
--
-- After this migration:
--   • responder_role text — 'host' or 'vendor' (existing rows default
--     to vendor; backfilled).
--   • responder_user_id uuid — the user account that wrote the
--     response. Backfilled from vendor_profiles.user_id for existing
--     vendor rows; populated automatically by trigger on insert.
--   • vendor_id nullable — host responses leave it null.
--   • RLS: insert/update/delete allowed when the responder is the
--     subject of the review (vendor when rater_role='host', host when
--     rater_role='vendor').
--   • Public read stays open — responses are publicly visible.

alter table public.review_responses
  add column if not exists responder_role text not null default 'vendor',
  add column if not exists responder_user_id uuid
    references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='review_responses_responder_role_check'
  ) then
    alter table public.review_responses
      add constraint review_responses_responder_role_check
      check (responder_role in ('host','vendor'));
  end if;
end $$;

alter table public.review_responses alter column vendor_id drop not null;

update public.review_responses rr
   set responder_user_id = vp.user_id
  from public.vendor_profiles vp
 where rr.responder_user_id is null
   and rr.vendor_id is not null
   and rr.vendor_id = vp.id;

create or replace function public.tg_review_responses_set_responder()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if new.responder_user_id is null then
    new.responder_user_id := (select auth.uid());
  end if;
  return new;
end
$$;

drop trigger if exists review_responses_set_responder on public.review_responses;
create trigger review_responses_set_responder
  before insert on public.review_responses
  for each row
  execute function public.tg_review_responses_set_responder();

drop policy if exists "review_responses vendor insert" on public.review_responses;
drop policy if exists "review_responses vendor update" on public.review_responses;
drop policy if exists "review_responses vendor delete" on public.review_responses;
drop policy if exists "review_responses subject insert" on public.review_responses;
drop policy if exists "review_responses subject update" on public.review_responses;
drop policy if exists "review_responses subject delete" on public.review_responses;

create policy "review_responses subject insert"
  on public.review_responses
  for insert
  with check (
    (
      responder_role = 'vendor'
      and exists (
        select 1 from public.reviews r
         where r.id = review_id
           and r.rater_role = 'host'
           and public.is_vendor_member(r.vendor_id)
      )
    )
    or (
      responder_role = 'host'
      and exists (
        select 1 from public.reviews r
         where r.id = review_id
           and r.rater_role = 'vendor'
           and r.host_id = (select auth.uid())
      )
    )
  );

create policy "review_responses subject update"
  on public.review_responses
  for update
  using (
    (
      responder_role = 'vendor'
      and exists (
        select 1 from public.reviews r
         where r.id = review_id and public.is_vendor_member(r.vendor_id)
      )
    )
    or (
      responder_role = 'host'
      and exists (
        select 1 from public.reviews r
         where r.id = review_id and r.host_id = (select auth.uid())
      )
    )
  )
  with check (
    (
      responder_role = 'vendor'
      and exists (
        select 1 from public.reviews r
         where r.id = review_id and public.is_vendor_member(r.vendor_id)
      )
    )
    or (
      responder_role = 'host'
      and exists (
        select 1 from public.reviews r
         where r.id = review_id and r.host_id = (select auth.uid())
      )
    )
  );

create policy "review_responses subject delete"
  on public.review_responses
  for delete
  using (
    (
      responder_role = 'vendor'
      and exists (
        select 1 from public.reviews r
         where r.id = review_id and public.is_vendor_member(r.vendor_id)
      )
    )
    or (
      responder_role = 'host'
      and exists (
        select 1 from public.reviews r
         where r.id = review_id and r.host_id = (select auth.uid())
      )
    )
  );
