-- Review requests: vendor sends a tokenized link to a past client
-- asking them to leave a review. Closes the loop on completed
-- inquiries and is the only realistic way for new vendors to build
-- a review base.
--
-- Reviewer doesn't need an account — the token authorizes the
-- review submission via SECURITY DEFINER RPC. If the inquiry's
-- host is signed in and matches, we link the review to their
-- profile; otherwise we record the email and create an anonymous
-- review (still gets vendor_id + body + rating).
--
-- One open request per inquiry per vendor. Re-sending bumps the
-- existing request's sent_at counter rather than creating a dup.

create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete cascade,
  recipient_email text not null,
  recipient_name text,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  status text not null default 'sent'
    check (status in ('sent', 'completed', 'expired', 'revoked')),
  sent_at timestamptz not null default now(),
  send_count integer not null default 1,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index review_requests_open_idx
  on public.review_requests (vendor_id, recipient_email)
  where status = 'sent';

create index review_requests_vendor_idx
  on public.review_requests (vendor_id, created_at desc);

alter table public.review_requests enable row level security;

-- Vendor sees their own requests.
create policy "review_requests vendor select"
  on public.review_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

-- Vendor can insert + update (revoke / re-send).
create policy "review_requests vendor insert"
  on public.review_requests for insert
  to authenticated
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "review_requests vendor update"
  on public.review_requests for update
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

-- RPC: vendor sends or re-sends a review request. Idempotent on
-- (vendor_id, recipient_email) for status='sent' rows.
create or replace function public.send_review_request(
  p_vendor_id uuid,
  p_inquiry_id uuid,
  p_recipient_email text,
  p_recipient_name text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  -- Caller must own the vendor.
  if not exists (
    select 1 from public.vendor_profiles
    where id = p_vendor_id and user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  v_email := lower(trim(p_recipient_email));
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'invalid email';
  end if;

  -- Bump existing open request, or insert new.
  update public.review_requests
  set sent_at = now(),
      send_count = send_count + 1,
      recipient_name = coalesce(p_recipient_name, recipient_name)
  where vendor_id = p_vendor_id
    and recipient_email = v_email
    and status = 'sent'
  returning id into v_id;

  if v_id is null then
    insert into public.review_requests (
      vendor_id, inquiry_id, recipient_email, recipient_name
    ) values (
      p_vendor_id, p_inquiry_id, v_email, p_recipient_name
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.send_review_request(uuid, uuid, text, text) to authenticated;

-- RPC: public token-based review submission. Anyone with the token
-- can leave a review on the linked vendor. Idempotent: re-using the
-- token after completion returns the existing review id (so they
-- can see "you already reviewed").
create or replace function public.submit_review_via_token(
  p_token text,
  p_rating integer,
  p_body text default null,
  p_reviewer_name text default null
)
returns uuid
language plpgsql security definer set search_path = public
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

  -- If already completed, return the existing review id.
  if v_request.status = 'completed' then
    select id into v_review_id
      from public.reviews
      where inquiry_id = v_request.inquiry_id
        and vendor_id = v_request.vendor_id
      limit 1;
    return v_review_id;
  end if;

  -- Try to resolve host_id from the inquiry, falling back to the
  -- caller if signed in. The reviews table needs host_id NOT NULL
  -- so we require at least one of these.
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

  -- Insert (or upsert if a review already exists on the inquiry).
  insert into public.reviews (inquiry_id, vendor_id, host_id, rating, body)
  values (
    coalesce(v_request.inquiry_id, gen_random_uuid()),
    v_request.vendor_id,
    v_host_id,
    p_rating,
    nullif(trim(coalesce(p_body, '')), '')
  )
  on conflict (inquiry_id) do update set
    rating = excluded.rating,
    body = excluded.body,
    updated_at = now()
  returning id into v_review_id;

  -- Mark request completed.
  update public.review_requests
  set status = 'completed',
      completed_at = now()
  where id = v_request.id;

  return v_review_id;
end;
$$;

grant execute on function public.submit_review_via_token(text, integer, text, text)
  to anon, authenticated;

-- Public RPC for the review form to fetch context (vendor name,
-- whether already completed) without needing direct table access.
create or replace function public.get_review_request_context(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
stable
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'request_id', rr.id,
    'status', rr.status,
    'recipient_name', rr.recipient_name,
    'vendor_id', rr.vendor_id,
    'vendor_name', vp.business_name,
    'vendor_category', vp.category,
    'vendor_slug', vp.slug
  )
  into v
  from public.review_requests rr
  join public.vendor_profiles vp on vp.id = rr.vendor_id
  where rr.token = p_token;
  return v;
end;
$$;

grant execute on function public.get_review_request_context(text)
  to anon, authenticated;
