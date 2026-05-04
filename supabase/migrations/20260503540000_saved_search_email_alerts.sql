-- Saved-search email alerts. The existing scan only fires in-app
-- notifications by design (avoiding new-vendor email spam). Now hosts
-- can opt-in PER SEARCH so the curated, narrow ones (e.g. "florists in
-- Brooklyn under $5k") trigger email — the broad/exploratory ones stay
-- in-app only.
--
-- Done by adding email_alerts_enabled to saved_searches + extending
-- enqueue_saved_search_matches to surface that flag plus the host's
-- email so the edge function can fan out emails in one batch.

alter table public.saved_searches
  add column if not exists email_alerts_enabled boolean not null default false;

create or replace function public.enqueue_saved_search_matches()
returns table (
  saved_search_id uuid,
  host_id uuid,
  host_email text,
  search_name text,
  match_count int,
  email_alerts_enabled boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_count int;
  v_link text;
begin
  for r in
    select id, host_id, name, filters, last_notified_at, email_alerts_enabled
    from public.saved_searches
    where notify_new_matches = true
  loop
    select count(*) into v_count
    from public.vendor_profiles vp
    where vp.created_at > r.last_notified_at
      and (
        coalesce(r.filters->>'category', '') = ''
        or vp.category = r.filters->>'category'
      )
      and (
        coalesce(r.filters->>'q', '') = ''
        or vp.business_name ilike '%' || (r.filters->>'q') || '%'
        or vp.category ilike '%' || (r.filters->>'q') || '%'
        or coalesce(vp.bio, '') ilike '%' || (r.filters->>'q') || '%'
      );

    if v_count > 0 then
      v_link := '/vendors';
      insert into public.notifications (user_id, type, title, body, link)
      values (
        r.host_id,
        'saved_search_match',
        'New vendor matches "' || r.name || '"',
        v_count || ' new ' || (case when v_count = 1 then 'vendor' else 'vendors' end)
          || ' joined that match your saved search.',
        v_link
      );

      update public.saved_searches
      set last_notified_at = now()
      where id = r.id;

      -- Yield row for the edge function so it can decide whether to
      -- also fire an email.
      return query
        select
          r.id,
          r.host_id,
          (select email from auth.users where id = r.host_id) as host_email,
          r.name,
          v_count,
          r.email_alerts_enabled;
    end if;
  end loop;
end$$;

revoke execute on function public.enqueue_saved_search_matches() from public, anon, authenticated;
