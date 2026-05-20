-- 10-minute edit window on reviews so a typo in the body or a fat-
-- fingered star count isn't permanent. Two layers:
--
--   1. Tighten the existing rater UPDATE policy to additionally
--      require created_at > now() - interval '10 minutes'. This is
--      the real gate; the row is invisible to UPDATE outside the
--      window regardless of how the client calls it.
--
--   2. Add a public.update_review RPC that surfaces the failure
--      modes as machine-readable exceptions instead of the silent
--      "0 rows affected" the policy gives. The RPC runs SECURITY
--      INVOKER so the policy still applies — the RPC's checks are
--      just there to raise readable errors before the policy can
--      no-op.
--
-- We deliberately gate on created_at, not updated_at, so editing
-- doesn't extend the window. Ten minutes is fix-a-typo territory,
-- not "wait to see what the counterparty said and rewrite mine."

drop policy if exists "reviews rater update own" on public.reviews;
create policy "reviews rater update own"
  on public.reviews
  for update
  using (
    (
      (rater_role = 'host' and (select auth.uid()) = host_id)
      or (rater_role = 'vendor' and public.is_vendor_member(vendor_id))
    )
    and created_at > now() - interval '10 minutes'
  )
  with check (
    (
      (rater_role = 'host' and (select auth.uid()) = host_id)
      or (rater_role = 'vendor' and public.is_vendor_member(vendor_id))
    )
    and created_at > now() - interval '10 minutes'
  );

create or replace function public.update_review(
  p_id uuid,
  p_rating int,
  p_body text default null,
  p_photo_urls jsonb default null
)
returns public.reviews
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_existing public.reviews;
  v_updated public.reviews;
  v_new_body text;
begin
  select * into v_existing from public.reviews where id = p_id;
  if v_existing.id is null then
    raise exception 'not_found';
  end if;

  if v_existing.rater_role = 'host' then
    if (select auth.uid()) <> v_existing.host_id then
      raise exception 'not_authorized';
    end if;
  elsif v_existing.rater_role = 'vendor' then
    if not public.is_vendor_member(v_existing.vendor_id) then
      raise exception 'not_authorized';
    end if;
  end if;

  if v_existing.created_at <= now() - interval '10 minutes' then
    raise exception 'edit_window_expired';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  -- p_body null = leave alone, '' / whitespace = clear, else trim.
  if p_body is null then
    v_new_body := v_existing.body;
  else
    v_new_body := nullif(trim(p_body), '');
  end if;

  update public.reviews
     set rating = p_rating,
         body = v_new_body,
         photo_urls = coalesce(p_photo_urls, photo_urls),
         updated_at = now()
   where id = p_id
   returning * into v_updated;

  if v_updated.id is null then
    -- Policy denied the update. Shouldn't happen — we already
    -- verified identity + window above — but surface a clean error
    -- if some race somehow expires the window mid-call.
    raise exception 'edit_window_expired';
  end if;

  return v_updated;
end
$$;

grant execute on function public.update_review(uuid, int, text, jsonb) to authenticated;
