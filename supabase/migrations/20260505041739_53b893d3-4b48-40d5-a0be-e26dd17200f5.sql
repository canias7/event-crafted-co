-- Canonical RPC restoration (20260506000000)

drop function if exists public.send_review_request(uuid, uuid, text, text);
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

drop function if exists public.submit_review_via_token(text, integer, text, text);
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
  if v_request.status = 'completed' then
    select id into v_review_id
      from public.reviews
      where inquiry_id = v_request.inquiry_id
        and vendor_id = v_request.vendor_id
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
  update public.review_requests
  set status = 'completed',
      completed_at = now()
  where id = v_request.id;
  return v_review_id;
end;
$$;
grant execute on function public.submit_review_via_token(text, integer, text, text)
  to anon, authenticated;

create or replace function public.get_review_request_context(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
stable
as $$
declare v jsonb;
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
grant execute on function public.get_review_request_context(text) to anon, authenticated;

create or replace function public.mark_proposal_viewed(p_proposal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_host_id uuid; v_last timestamptz;
begin
  if auth.uid() is null then return; end if;
  select host_id, last_viewed_at into v_host_id, v_last
    from public.proposals
    where id = p_proposal_id;
  if v_host_id is null or v_host_id <> auth.uid() then return; end if;
  if v_last is not null and v_last > now() - interval '60 seconds' then return; end if;
  update public.proposals
  set first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now(),
      view_count = view_count + 1
  where id = p_proposal_id;
end;
$$;
grant execute on function public.mark_proposal_viewed(uuid) to authenticated;

drop function if exists public.toggle_proposal_share(uuid, boolean);
create or replace function public.toggle_proposal_share(
  p_proposal_id uuid,
  p_enabled boolean
)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_vendor_id uuid; v_token text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select vendor_id into v_vendor_id from public.proposals where id = p_proposal_id;
  if v_vendor_id is null then raise exception 'proposal not found'; end if;
  if not exists (
    select 1 from public.vendor_profiles vp
    where vp.id = v_vendor_id and vp.user_id = auth.uid()
  ) then raise exception 'not authorized'; end if;
  if p_enabled then
    select share_token into v_token from public.proposals where id = p_proposal_id;
    if v_token is null then
      v_token := encode(gen_random_bytes(12), 'hex');
      update public.proposals
        set share_token = v_token, share_enabled_at = now()
        where id = p_proposal_id;
    end if;
    return v_token;
  else
    update public.proposals
      set share_token = null, share_enabled_at = null
      where id = p_proposal_id;
    return null;
  end if;
end;
$$;
grant execute on function public.toggle_proposal_share(uuid, boolean) to authenticated;

create or replace function public.get_proposal_by_share_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
stable
as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'line_items', p.line_items,
    'subtotal_cents', p.subtotal_cents,
    'deposit_cents', p.deposit_cents,
    'terms', p.terms,
    'contract_body', p.contract_body,
    'status', p.status,
    'sent_at', p.sent_at,
    'vendor', jsonb_build_object(
      'business_name', vp.business_name,
      'location', vp.location,
      'slug', vp.slug
    ),
    'event', jsonb_build_object(
      'event_type', i.event_type,
      'event_date', i.event_date
    )
  )
  into v
  from public.proposals p
  join public.vendor_profiles vp on vp.id = p.vendor_id
  left join public.inquiries i on i.id = p.inquiry_id
  where p.share_token = p_token
    and p.share_token is not null;
  return v;
end;
$$;
grant execute on function public.get_proposal_by_share_token(text) to anon, authenticated;

create or replace function public.get_microsite_rsvp_config(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
stable
as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'deadline', microsite_rsvp_deadline,
    'intro', microsite_rsvp_intro,
    'questions', coalesce(microsite_rsvp_questions, '[]'::jsonb),
    'show', microsite_show_rsvp
  )
  into v
  from public.host_events
  where microsite_token = p_token
    and microsite_published_at is not null
    and archived_at is null;
  return v;
end;
$$;
grant execute on function public.get_microsite_rsvp_config(text) to anon, authenticated;

drop function if exists public.submit_microsite_rsvp(text, text, text, boolean, integer, text, jsonb);
create or replace function public.submit_microsite_rsvp(
  p_token text,
  p_name text,
  p_email text,
  p_attending boolean,
  p_plus_ones integer default 0,
  p_message text default null,
  p_answers jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_event_id uuid;
  v_show boolean;
  v_deadline timestamptz;
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  if coalesce(trim(p_email), '') = '' or position('@' in p_email) = 0 then
    raise exception 'valid email required';
  end if;
  if p_plus_ones < 0 or p_plus_ones > 20 then raise exception 'plus_ones out of range'; end if;
  select id, microsite_show_rsvp, microsite_rsvp_deadline
    into v_event_id, v_show, v_deadline
    from public.host_events
    where microsite_token = p_token
      and microsite_published_at is not null
      and archived_at is null;
  if v_event_id is null then raise exception 'event not found'; end if;
  if not v_show then raise exception 'rsvp closed'; end if;
  if v_deadline is not null and v_deadline < now() then
    raise exception 'rsvp deadline passed';
  end if;
  insert into public.event_microsite_rsvps (
    event_id, guest_name, guest_email, attending, plus_ones, message, answers
  ) values (
    v_event_id, trim(p_name), lower(trim(p_email)), p_attending,
    p_plus_ones, nullif(trim(coalesce(p_message, '')), ''), p_answers
  )
  on conflict (event_id, guest_email) do update set
    guest_name = excluded.guest_name,
    attending = excluded.attending,
    plus_ones = excluded.plus_ones,
    message = excluded.message,
    answers = excluded.answers,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.submit_microsite_rsvp(
  text, text, text, boolean, integer, text, jsonb
) to anon, authenticated;
