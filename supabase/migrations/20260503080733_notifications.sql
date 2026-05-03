-- In-app notifications + realtime + insert triggers from inquiry/message/
-- review activity. Notifications are user-scoped (read/update own); writes
-- happen through SECURITY DEFINER triggers so clients can't spoof them.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications user select"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notifications user update"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notifications user delete"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- Inserts: only via SECURITY DEFINER triggers, never directly from clients.

alter publication supabase_realtime add table public.notifications;

-- ─── Triggers ─────────────────────────────────────────────────────────

-- New inquiry → notify the vendor
create or replace function public.notify_inquiry_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_vendor_user uuid;
  v_host_name   text;
begin
  select vp.user_id into v_vendor_user
    from public.vendor_profiles vp
    where vp.id = new.vendor_id;
  select coalesce(p.display_name, 'A host') into v_host_name
    from public.profiles p
    where p.id = new.host_id;
  if v_vendor_user is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_vendor_user,
      'inquiry_created',
      'New inquiry',
      v_host_name || ' is asking about a ' || replace(new.event_type, '_', ' ') || ' event',
      '/vendor/inbox/' || new.id::text
    );
  end if;
  return new;
end$$;

create trigger inquiries_notify_created
  after insert on public.inquiries
  for each row execute function public.notify_inquiry_created();

-- Inquiry status change → notify the host (when status moves to replied / won / lost)
create or replace function public.notify_inquiry_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_vendor_name text;
  v_title       text;
  v_body        text;
begin
  if new.status = old.status then
    return new;
  end if;

  select vp.business_name into v_vendor_name
    from public.vendor_profiles vp where vp.id = new.vendor_id;

  if new.status = 'replied' then
    v_title := coalesce(v_vendor_name, 'A vendor') || ' replied';
    v_body  := 'Tap to read their response.';
  elsif new.status = 'won' then
    v_title := 'Booking confirmed';
    v_body  := coalesce(v_vendor_name, 'Your vendor') || ' marked your event as booked.';
  elsif new.status = 'lost' then
    v_title := 'Inquiry closed';
    v_body  := coalesce(v_vendor_name, 'The vendor') || ' closed this inquiry.';
  else
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.host_id,
    'inquiry_status',
    v_title,
    v_body,
    '/customer/inquiries/' || new.id::text
  );
  return new;
end$$;

create trigger inquiries_notify_status
  after update of status on public.inquiries
  for each row execute function public.notify_inquiry_status();

-- New message → notify the OTHER party
create or replace function public.notify_new_message()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_inquiry      public.inquiries%rowtype;
  v_recipient    uuid;
  v_sender_name  text;
  v_link         text;
begin
  -- Skip drafts; only fire when a real message lands
  if new.is_draft then
    return new;
  end if;

  select * into v_inquiry from public.inquiries where id = new.inquiry_id;
  if not found then
    return new;
  end if;

  if new.sender_role = 'host' then
    -- notify the vendor user
    select vp.user_id into v_recipient
      from public.vendor_profiles vp where vp.id = v_inquiry.vendor_id;
    select coalesce(p.display_name, 'The host') into v_sender_name
      from public.profiles p where p.id = v_inquiry.host_id;
    v_link := '/vendor/inbox/' || v_inquiry.id::text;
  else
    -- vendor or agent → notify the host
    v_recipient := v_inquiry.host_id;
    select coalesce(vp.business_name, 'The vendor') into v_sender_name
      from public.vendor_profiles vp where vp.id = v_inquiry.vendor_id;
    v_link := '/customer/inquiries/' || v_inquiry.id::text;
  end if;

  if v_recipient is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_recipient,
      'message_received',
      v_sender_name || ' sent a message',
      left(new.body, 140),
      v_link
    );
  end if;

  return new;
end$$;

create trigger messages_notify_new
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- New review → notify the vendor
create or replace function public.notify_review_posted()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_vendor_user uuid;
  v_host_name   text;
begin
  select vp.user_id into v_vendor_user
    from public.vendor_profiles vp where vp.id = new.vendor_id;
  select coalesce(p.display_name, 'A host') into v_host_name
    from public.profiles p where p.id = new.host_id;
  if v_vendor_user is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_vendor_user,
      'review_posted',
      v_host_name || ' left a review',
      'They rated you ' || new.rating::text || '/5.',
      '/vendor/inbox/' || new.inquiry_id::text
    );
  end if;
  return new;
end$$;

create trigger reviews_notify_posted
  after insert on public.reviews
  for each row execute function public.notify_review_posted();

-- Vendor response to a review → notify the host
create or replace function public.notify_review_response()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_review     public.reviews%rowtype;
  v_vendor_nm  text;
begin
  select * into v_review from public.reviews where id = new.review_id;
  if not found then return new; end if;
  select coalesce(business_name, 'The vendor') into v_vendor_nm
    from public.vendor_profiles where id = v_review.vendor_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_review.host_id,
    'review_response',
    v_vendor_nm || ' responded to your review',
    left(new.body, 140),
    '/customer/inquiries/' || v_review.inquiry_id::text
  );
  return new;
end$$;

create trigger review_responses_notify
  after insert on public.review_responses
  for each row execute function public.notify_review_response();

-- Lock down trigger functions; trigger runs as definer-owner not caller
revoke execute on function public.notify_inquiry_created() from public, anon, authenticated;
revoke execute on function public.notify_inquiry_status() from public, anon, authenticated;
revoke execute on function public.notify_new_message() from public, anon, authenticated;
revoke execute on function public.notify_review_posted() from public, anon, authenticated;
revoke execute on function public.notify_review_response() from public, anon, authenticated;
