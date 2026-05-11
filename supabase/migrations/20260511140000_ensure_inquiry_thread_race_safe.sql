-- ensure_inquiry_thread previously did SELECT-then-INSERT to find or
-- create the thread for an inquiry. If two clients raced (e.g., a
-- host double-tapping an inbox row before the loading state kicks in),
-- the second caller would hit
--   23505 duplicate key value violates direct_threads_host_id_vendor_id_key
-- and error out.
--
-- Rewriting to use INSERT ... ON CONFLICT (host_id, vendor_id) DO
-- UPDATE so concurrent calls always converge on the same thread id
-- without surfacing a UNIQUE-violation error to the client. The
-- DO UPDATE also lets us back-fill inquiry_id on an existing thread
-- that predates the inquiry being linked.

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

  -- Race-safe insert: if a thread for (host, vendor) already exists,
  -- update its inquiry_id when missing instead of erroring.
  insert into public.direct_threads (host_id, vendor_id, inquiry_id)
  values (v_host, v_vendor_profile_id, p_inquiry_id)
  on conflict (host_id, vendor_id) do update
    set inquiry_id = coalesce(public.direct_threads.inquiry_id, excluded.inquiry_id)
  returning id into v_thread;

  return v_thread;
end;
$$;
