-- Find-or-create the direct_thread tied to a specific inquiry. Callable
-- by either side of the inquiry (the host who sent it, or the user who
-- owns the vendor_profile it was sent to) so the mobile apps can open
-- a conversation when a user taps an inbox row.
--
-- Existing find_or_create_direct_thread only works from the host side
-- (it uses auth.uid() as host_id). This sibling is symmetric and also
-- back-links the thread to its inquiry so the two stay paired.

create or replace function public.ensure_inquiry_thread(p_inquiry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_host uuid;
  v_vendor_profile_id uuid;
  v_vendor_user uuid;
  v_thread uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select host_id, vendor_id
    into v_host, v_vendor_profile_id
    from public.inquiries
   where id = p_inquiry_id;
  if v_host is null then
    raise exception 'inquiry_not_found';
  end if;

  select user_id
    into v_vendor_user
    from public.vendor_profiles
   where id = v_vendor_profile_id;

  if auth.uid() <> v_host and auth.uid() <> v_vendor_user then
    raise exception 'not_authorized';
  end if;

  -- Prefer a thread already linked to this inquiry; otherwise fall back
  -- to any thread between this host/vendor pair (predates inquiry_id
  -- being recorded).
  select id into v_thread
    from public.direct_threads
   where inquiry_id = p_inquiry_id
   limit 1;

  if v_thread is null then
    select id into v_thread
      from public.direct_threads
     where host_id = v_host and vendor_id = v_vendor_profile_id
     limit 1;
    if v_thread is not null then
      update public.direct_threads set inquiry_id = p_inquiry_id
       where id = v_thread and inquiry_id is null;
    end if;
  end if;

  if v_thread is null then
    insert into public.direct_threads (host_id, vendor_id, inquiry_id)
    values (v_host, v_vendor_profile_id, p_inquiry_id)
    returning id into v_thread;
  end if;

  return v_thread;
end;
$$;

revoke execute on function public.ensure_inquiry_thread(uuid) from public, anon;
grant execute on function public.ensure_inquiry_thread(uuid) to authenticated;
