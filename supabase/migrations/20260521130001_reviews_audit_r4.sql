-- Reviews audit round 4 fixes.
--
-- 1. submit_review_via_token currently INSERTs without an explicit
--    rater_role / kind, falling back to column defaults. With the
--    new bidirectional schema (host conversation review + host
--    event review + vendor counterparts), unspecified roles risk
--    misclassifying public-token submissions.
--
--    Also: the existing ON CONFLICT (inquiry_id) targets a unique
--    constraint that was dropped by 20260520030000_reviews_audit_
--    cleanup.sql. Calling the RPC today would fail to plan the
--    upsert. Retarget at the current unique index
--    (inquiry_id, rater_role, kind).
--
-- 2. review_responses UPDATE policy had no edit-window gate. Reviews
--    themselves are locked to a 10-minute typo-fix window
--    (20260520010000), but the responding party could mutate their
--    response indefinitely — defeating the design and enabling
--    post-hoc narrative shaping. Add the same gate.

-- ─── 1. Fix submit_review_via_token ────────────────────────────────

create or replace function public.submit_review_via_token(
  p_token text,
  p_rating integer,
  p_body text default null,
  p_reviewer_name text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request record;
  v_review_id uuid;
  v_host_id uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating 1-5 required';
  end if;
  select * into v_request
    from public.review_requests
    where token = p_token;
  if v_request.id is null then
    raise exception 'request not found';
  end if;
  if v_request.status = 'revoked' then
    raise exception 'request revoked';
  end if;
  if v_request.status = 'completed' then
    select id into v_review_id
      from public.reviews
      where inquiry_id = v_request.inquiry_id
        and vendor_id = v_request.vendor_id
        and rater_role = 'host'
        and kind = 'event'
      limit 1;
    return v_review_id;
  end if;
  if v_request.inquiry_id is not null then
    select host_id into v_host_id
      from public.inquiries
      where id = v_request.inquiry_id;
  end if;
  if v_host_id is null then
    v_host_id := auth.uid();
  end if;
  if v_host_id is null then
    raise exception 'reviewer must be signed in (or inquiry must be set)';
  end if;
  -- Public-token reviews are always the host rating the vendor on
  -- the event itself. Set rater_role + kind explicitly so the row
  -- lands in the right slot of the (inquiry, role, kind) unique
  -- index instead of relying on column defaults. Drop the obsolete
  -- ON CONFLICT (inquiry_id) — that constraint no longer exists.
  insert into public.reviews (
    inquiry_id, vendor_id, host_id, rating, body, rater_role, kind
  )
  values (
    coalesce(v_request.inquiry_id, gen_random_uuid()),
    v_request.vendor_id,
    v_host_id,
    p_rating,
    nullif(trim(coalesce(p_body, '')), ''),
    'host',
    'event'
  )
  on conflict (inquiry_id, rater_role, kind) do update set
    rating = excluded.rating,
    body = excluded.body,
    updated_at = now()
  returning id into v_review_id;
  update public.review_requests
  set status = 'completed',
      completed_at = now()
  where id = v_request.id;
  return v_review_id;
end;
$$;

grant execute on function public.submit_review_via_token(text, integer, text, text)
  to anon, authenticated;

-- ─── 2. Edit-window gate on review_responses UPDATE ────────────────

drop policy if exists "review_responses subject update"
  on public.review_responses;
create policy "review_responses subject update"
  on public.review_responses
  for update
  using (
    -- USING controls visibility-to-update — leave broad so the
    -- client can fetch the row to render the "Edit (Nm left)"
    -- countdown. The edit-window check lives in WITH CHECK below.
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
    -- 10-minute typo-fix window. Mirrors the gate on reviews
    -- themselves (20260520010000_review_edit_window.sql) so a
    -- vendor can't sit on a thoughtful response for days and
    -- craft post-hoc narrative outside the design.
    created_at > now() - interval '10 minutes'
    and (
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
  );
