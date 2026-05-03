insert into storage.buckets (id, name, public) values ('vendor-portfolios', 'vendor-portfolios', true) on conflict (id) do nothing;
create policy "vendor portfolios public read" on storage.objects for select using (bucket_id = 'vendor-portfolios');
create policy "vendor portfolios owner insert" on storage.objects for insert to authenticated with check (bucket_id = 'vendor-portfolios' and exists (select 1 from public.vendor_profiles vp where vp.id::text = (storage.foldername(name))[1] and vp.user_id = auth.uid()));
create policy "vendor portfolios owner delete" on storage.objects for delete to authenticated using (bucket_id = 'vendor-portfolios' and exists (select 1 from public.vendor_profiles vp where vp.id::text = (storage.foldername(name))[1] and vp.user_id = auth.uid()));

create table public.vendor_portfolio_images (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  storage_path text not null, caption text, display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index vendor_portfolio_images_vendor_idx on public.vendor_portfolio_images (vendor_id, display_order, created_at);
alter table public.vendor_portfolio_images enable row level security;
create policy "vendor_portfolio_images public read" on public.vendor_portfolio_images for select using (true);
create policy "vendor_portfolio_images owner insert" on public.vendor_portfolio_images for insert to authenticated with check (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "vendor_portfolio_images owner update" on public.vendor_portfolio_images for update to authenticated using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "vendor_portfolio_images owner delete" on public.vendor_portfolio_images for delete to authenticated using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null unique references public.inquiries(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5), body text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index reviews_vendor_idx on public.reviews (vendor_id, created_at desc);
create index reviews_host_idx on public.reviews (host_id);
alter table public.reviews enable row level security;
create policy "reviews host insert" on public.reviews for insert to authenticated with check (auth.uid() = host_id and exists (select 1 from public.inquiries i where i.id = inquiry_id and i.host_id = auth.uid() and i.status = 'won'));
create policy "reviews host update own" on public.reviews for update to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
create policy "reviews host delete own" on public.reviews for delete to authenticated using (auth.uid() = host_id);
create trigger reviews_updated before update on public.reviews for each row execute function public.tg_set_updated_at();

create table public.review_responses (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.review_responses enable row level security;
create policy "review_responses public read" on public.review_responses for select using (true);
create policy "review_responses vendor insert" on public.review_responses for insert to authenticated with check (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "review_responses vendor update" on public.review_responses for update to authenticated using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "review_responses vendor delete" on public.review_responses for delete to authenticated using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create trigger review_responses_updated before update on public.review_responses for each row execute function public.tg_set_updated_at();

create table public.vendor_unavailable_dates (
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  date date not null, reason text, created_at timestamptz not null default now(),
  primary key (vendor_id, date)
);
create index vendor_unavailable_dates_vendor_idx on public.vendor_unavailable_dates (vendor_id, date);
alter table public.vendor_unavailable_dates enable row level security;
create policy "vendor_unavailable_dates public read" on public.vendor_unavailable_dates for select using (true);
create policy "vendor_unavailable_dates owner insert" on public.vendor_unavailable_dates for insert to authenticated with check (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "vendor_unavailable_dates owner delete" on public.vendor_unavailable_dates for delete to authenticated using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "vendor_unavailable_dates owner update" on public.vendor_unavailable_dates for update to authenticated using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));

create table public.vendor_profile_views (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  viewed_at timestamptz not null default now()
);
create index vendor_profile_views_vendor_idx on public.vendor_profile_views (vendor_id, viewed_at desc);
alter table public.vendor_profile_views enable row level security;
create policy "vendor_profile_views public insert" on public.vendor_profile_views for insert to anon, authenticated with check (true);
create policy "vendor_profile_views vendor select" on public.vendor_profile_views for select to authenticated using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, category text, completed boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index checklist_items_host_idx on public.checklist_items (host_id, display_order, created_at);
alter table public.checklist_items enable row level security;
create policy "checklist_items host all" on public.checklist_items for all to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
create trigger checklist_items_updated before update on public.checklist_items for each row execute function public.tg_set_updated_at();

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  vendor_id uuid references public.vendor_profiles(id) on delete set null,
  category text, description text not null, amount_cents integer not null default 0,
  paid_cents integer not null default 0, due_date date, paid_at timestamptz, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index budget_items_host_idx on public.budget_items (host_id, due_date, created_at);
alter table public.budget_items enable row level security;
create policy "budget_items host all" on public.budget_items for all to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
create trigger budget_items_updated before update on public.budget_items for each row execute function public.tg_set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null, title text not null, body text, link text, read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;
create policy "notifications user select" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "notifications user update" on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications user delete" on public.notifications for delete to authenticated using (auth.uid() = user_id);
alter publication supabase_realtime add table public.notifications;

create or replace function public.notify_inquiry_created() returns trigger language plpgsql security definer set search_path = public as $$
declare v_vendor_user uuid; v_host_name text;
begin
  select vp.user_id into v_vendor_user from public.vendor_profiles vp where vp.id = new.vendor_id;
  select coalesce(p.display_name, 'A host') into v_host_name from public.profiles p where p.id = new.host_id;
  if v_vendor_user is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_vendor_user, 'inquiry_created', 'New inquiry', v_host_name || ' is asking about a ' || replace(new.event_type, '_', ' ') || ' event', '/vendor/inbox/' || new.id::text);
  end if;
  return new;
end$$;
create trigger inquiries_notify_created after insert on public.inquiries for each row execute function public.notify_inquiry_created();

create or replace function public.notify_inquiry_status() returns trigger language plpgsql security definer set search_path = public as $$
declare v_vendor_name text; v_title text; v_body text;
begin
  if new.status = old.status then return new; end if;
  select vp.business_name into v_vendor_name from public.vendor_profiles vp where vp.id = new.vendor_id;
  if new.status = 'replied' then v_title := coalesce(v_vendor_name, 'A vendor') || ' replied'; v_body := 'Tap to read their response.';
  elsif new.status = 'won' then v_title := 'Booking confirmed'; v_body := coalesce(v_vendor_name, 'Your vendor') || ' marked your event as booked.';
  elsif new.status = 'lost' then v_title := 'Inquiry closed'; v_body := coalesce(v_vendor_name, 'The vendor') || ' closed this inquiry.';
  else return new; end if;
  insert into public.notifications (user_id, type, title, body, link) values (new.host_id, 'inquiry_status', v_title, v_body, '/customer/inquiries/' || new.id::text);
  return new;
end$$;
create trigger inquiries_notify_status after update of status on public.inquiries for each row execute function public.notify_inquiry_status();

create or replace function public.notify_new_message() returns trigger language plpgsql security definer set search_path = public as $$
declare v_inquiry public.inquiries%rowtype; v_recipient uuid; v_sender_name text; v_link text;
begin
  if new.is_draft then return new; end if;
  select * into v_inquiry from public.inquiries where id = new.inquiry_id;
  if not found then return new; end if;
  if new.sender_role = 'host' then
    select vp.user_id into v_recipient from public.vendor_profiles vp where vp.id = v_inquiry.vendor_id;
    select coalesce(p.display_name, 'The host') into v_sender_name from public.profiles p where p.id = v_inquiry.host_id;
    v_link := '/vendor/inbox/' || v_inquiry.id::text;
  else
    v_recipient := v_inquiry.host_id;
    select coalesce(vp.business_name, 'The vendor') into v_sender_name from public.vendor_profiles vp where vp.id = v_inquiry.vendor_id;
    v_link := '/customer/inquiries/' || v_inquiry.id::text;
  end if;
  if v_recipient is not null then
    insert into public.notifications (user_id, type, title, body, link) values (v_recipient, 'message_received', v_sender_name || ' sent a message', left(new.body, 140), v_link);
  end if;
  return new;
end$$;
create trigger messages_notify_new after insert on public.messages for each row execute function public.notify_new_message();

create or replace function public.notify_review_posted() returns trigger language plpgsql security definer set search_path = public as $$
declare v_vendor_user uuid; v_host_name text;
begin
  select vp.user_id into v_vendor_user from public.vendor_profiles vp where vp.id = new.vendor_id;
  select coalesce(p.display_name, 'A host') into v_host_name from public.profiles p where p.id = new.host_id;
  if v_vendor_user is not null then
    insert into public.notifications (user_id, type, title, body, link) values (v_vendor_user, 'review_posted', v_host_name || ' left a review', 'They rated you ' || new.rating::text || '/5.', '/vendor/inbox/' || new.inquiry_id::text);
  end if;
  return new;
end$$;
create trigger reviews_notify_posted after insert on public.reviews for each row execute function public.notify_review_posted();

create or replace function public.notify_review_response() returns trigger language plpgsql security definer set search_path = public as $$
declare v_review public.reviews%rowtype; v_vendor_nm text;
begin
  select * into v_review from public.reviews where id = new.review_id;
  if not found then return new; end if;
  select coalesce(business_name, 'The vendor') into v_vendor_nm from public.vendor_profiles where id = v_review.vendor_id;
  insert into public.notifications (user_id, type, title, body, link) values (v_review.host_id, 'review_response', v_vendor_nm || ' responded to your review', left(new.body, 140), '/customer/inquiries/' || v_review.inquiry_id::text);
  return new;
end$$;
create trigger review_responses_notify after insert on public.review_responses for each row execute function public.notify_review_response();

revoke execute on function public.notify_inquiry_created() from public, anon, authenticated;
revoke execute on function public.notify_inquiry_status() from public, anon, authenticated;
revoke execute on function public.notify_new_message() from public, anon, authenticated;
revoke execute on function public.notify_review_posted() from public, anon, authenticated;
revoke execute on function public.notify_review_response() from public, anon, authenticated;

create table public.event_tasks (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, category text,
  priority text check (priority in ('low','medium','high')),
  status text not null default 'pending' check (status in ('pending','in-progress','completed','overdue')),
  due_date date, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index event_tasks_host_idx on public.event_tasks (host_id, due_date, created_at);
alter table public.event_tasks enable row level security;
create policy "event_tasks host all" on public.event_tasks for all to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
create trigger event_tasks_updated before update on public.event_tasks for each row execute function public.tg_set_updated_at();

create or replace function public.request_account_deletion() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.profiles where id = auth.uid();
end$$;
revoke execute on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
grant execute on function public.is_admin() to authenticated;

create policy "profiles admin select" on public.profiles for select to authenticated using (public.is_admin());
create policy "inquiries admin select" on public.inquiries for select to authenticated using (public.is_admin());
create policy "messages admin select" on public.messages for select to authenticated using (public.is_admin());
create policy "reviews admin select" on public.reviews for select to authenticated using (public.is_admin());
create policy "vendor_profiles admin update" on public.vendor_profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, line_items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0, deposit_cents integer, terms text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  sent_at timestamptz default now(), responded_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index proposals_inquiry_idx on public.proposals (inquiry_id, created_at desc);
create index proposals_vendor_idx on public.proposals (vendor_id, status);
alter table public.proposals enable row level security;
create policy "proposals participants select" on public.proposals for select to authenticated using (auth.uid() = host_id or exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "proposals vendor insert" on public.proposals for insert to authenticated with check (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "proposals vendor update" on public.proposals for update to authenticated using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "proposals host update" on public.proposals for update to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
create trigger proposals_updated before update on public.proposals for each row execute function public.tg_set_updated_at();

create or replace function public.notify_proposal_sent() returns trigger language plpgsql security definer set search_path = public as $$
declare v_vendor_name text;
begin
  select coalesce(business_name, 'A vendor') into v_vendor_name from public.vendor_profiles where id = new.vendor_id;
  insert into public.notifications (user_id, type, title, body, link) values (new.host_id, 'proposal_sent', v_vendor_name || ' sent a proposal', 'Tap to review and accept or counter.', '/customer/inquiries/' || new.inquiry_id::text);
  return new;
end$$;
create trigger proposals_notify_sent after insert on public.proposals for each row execute function public.notify_proposal_sent();

create or replace function public.accept_proposal_side_effects() returns trigger language plpgsql security definer set search_path = public as $$
declare v_vendor_user uuid; v_vendor_name text;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    update public.inquiries set status = 'won' where id = new.inquiry_id and status <> 'won';
    select vp.user_id, vp.business_name into v_vendor_user, v_vendor_name from public.vendor_profiles vp where vp.id = new.vendor_id;
    if v_vendor_user is not null then
      insert into public.notifications (user_id, type, title, body, link) values (v_vendor_user, 'proposal_accepted', 'Proposal accepted', 'Your proposal was accepted — the inquiry is now booked.', '/vendor/inbox/' || new.inquiry_id::text);
    end if;
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    select vp.user_id into v_vendor_user from public.vendor_profiles vp where vp.id = new.vendor_id;
    if v_vendor_user is not null then
      insert into public.notifications (user_id, type, title, body, link) values (v_vendor_user, 'proposal_rejected', 'Proposal declined', 'The host declined your proposal. You can send a revised one.', '/vendor/inbox/' || new.inquiry_id::text);
    end if;
  end if;
  return new;
end$$;
create trigger proposals_status_side_effects after update of status on public.proposals for each row execute function public.accept_proposal_side_effects();
revoke execute on function public.notify_proposal_sent() from public, anon, authenticated;
revoke execute on function public.accept_proposal_side_effects() from public, anon, authenticated;

insert into storage.buckets (id, name, public) values ('message-attachments', 'message-attachments', true) on conflict (id) do nothing;
create policy "message attachments public read" on storage.objects for select using (bucket_id = 'message-attachments');
create policy "message attachments authenticated insert" on storage.objects for insert to authenticated with check (bucket_id = 'message-attachments');
create policy "message attachments authenticated delete" on storage.objects for delete to authenticated using (bucket_id = 'message-attachments');
alter table public.messages add column attachments jsonb not null default '[]'::jsonb;

alter table public.reviews add column hidden_at timestamptz, add column hidden_reason text;
create policy "reviews public read" on public.reviews for select using (hidden_at is null or auth.uid() = host_id or exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "reviews admin update" on public.reviews for update to authenticated using (public.is_admin()) with check (public.is_admin());
