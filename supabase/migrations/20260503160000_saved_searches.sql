-- Saved searches: hosts pin a vendor browse filter set so they can run
-- it again with one click, and optionally get notified when new vendors
-- joining the directory match the saved query.
--
-- filters jsonb shape (versioned via _version):
--   { _version: 1, q?: string, category?: string }
-- Date isn't stored — it's dynamic per use of the saved search.

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  notify_new_matches boolean not null default true,
  last_notified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_searches_host_idx
  on public.saved_searches (host_id, created_at desc);

create index saved_searches_notify_idx
  on public.saved_searches (notify_new_matches, last_notified_at)
  where notify_new_matches = true;

alter table public.saved_searches enable row level security;

create policy "saved_searches owner select"
  on public.saved_searches for select
  to authenticated
  using (host_id = auth.uid());

create policy "saved_searches owner insert"
  on public.saved_searches for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "saved_searches owner update"
  on public.saved_searches for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "saved_searches owner delete"
  on public.saved_searches for delete
  to authenticated
  using (host_id = auth.uid());

create trigger saved_searches_updated
  before update on public.saved_searches
  for each row execute function public.tg_set_updated_at();

-- SECURITY DEFINER scanner that finds new vendor matches per saved search
-- and drops in-app notifications. Atomically updates last_notified_at so
-- a re-run within the same window doesn't re-notify.
create or replace function public.enqueue_saved_search_matches()
returns table (
  saved_search_id uuid,
  host_id uuid,
  search_name text,
  match_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int;
  v_link text;
begin
  for r in
    select id, host_id, name, filters, last_notified_at
    from public.saved_searches
    where notify_new_matches = true
  loop
    -- Count vendor_profiles created since last_notified_at that match
    -- the saved filters. Use ILIKE for the query term so it's case-
    -- insensitive across name/category/bio.
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

      return query select r.id, r.host_id, r.name, v_count;
    end if;
  end loop;
end$$;

grant execute on function public.enqueue_saved_search_matches() to service_role;
