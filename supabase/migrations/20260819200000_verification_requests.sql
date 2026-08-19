-- Structured verification, per the reference mock: Pro/Premium vendors
-- submit ONE account-level request (identity + business info + proof
-- documents), admins review it, and approval grants the public
-- Verified badge (vendor_profiles.verified_at) and optionally the
-- Insured marker. Statuses: under_review → approved / needs_info /
-- rejected; needs_info lets the vendor edit + resubmit.

create table if not exists public.vendor_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'under_review'
    check (status in ('under_review','approved','needs_info','rejected')),
  legal_first_name text not null,
  legal_last_name text not null,
  dob date,
  id_front_path text not null,
  id_back_path text,
  business_name text not null,
  business_category text,
  business_email text,
  business_phone text,
  business_address text,
  website text,
  documents jsonb not null default '[]'::jsonb,
  admin_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vvr_status_idx
  on public.vendor_verification_requests (status, submitted_at desc);
alter table public.vendor_verification_requests enable row level security;

-- Owner reads their own request.
drop policy if exists "vvr_owner_select" on public.vendor_verification_requests;
create policy "vvr_owner_select" on public.vendor_verification_requests
  for select using (auth.uid() = user_id);

-- Submitting requires Pro+ — the eligibility IS the plan perk.
drop policy if exists "vvr_owner_insert" on public.vendor_verification_requests;
create policy "vvr_owner_insert" on public.vendor_verification_requests
  for insert with check (auth.uid() = user_id and public.is_pro_user(auth.uid()));

-- Owner may edit + resubmit while not approved (needs_info round-trips).
drop policy if exists "vvr_owner_update" on public.vendor_verification_requests;
create policy "vvr_owner_update" on public.vendor_verification_requests
  for update using (auth.uid() = user_id and status <> 'approved')
  with check (auth.uid() = user_id);

-- Admins see + manage everything.
drop policy if exists "vvr_admin_all" on public.vendor_verification_requests;
create policy "vvr_admin_all" on public.vendor_verification_requests
  for all using (
    exists (select 1 from public.user_roles ur
            where ur.user_id = auth.uid() and ur.role = 'admin')
  ) with check (
    exists (select 1 from public.user_roles ur
            where ur.user_id = auth.uid() and ur.role = 'admin')
  );

-- Storage: the private vendor-verifications bucket already exists with
-- vendor_profiles.id-keyed folders. The new flow keys folders by
-- auth.uid() — add matching owner policies.
drop policy if exists "vvr user folder insert" on storage.objects;
create policy "vvr user folder insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "vvr user folder read" on storage.objects;
create policy "vvr user folder read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vendor-verifications'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.user_roles ur
                 where ur.user_id = auth.uid() and ur.role = 'admin')
    )
  );
drop policy if exists "vvr user folder update" on storage.objects;
create policy "vvr user folder update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vendor-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "vvr user folder delete" on storage.objects;
create policy "vvr user folder delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Insured marker on the public listing row ("Certificate on file").
alter table public.vendor_profiles
  add column if not exists insured_at timestamptz;

-- Notify admins when a request lands (insert or resubmission).
create or replace function public.notify_admins_verification_request()
returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status <> 'under_review' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'under_review' then return new; end if;
  for r in select user_id from public.user_roles where role = 'admin' loop
    insert into public.notifications (user_id, type, title, body, link)
    values (
      r.user_id,
      'verification_request',
      'Verification to review',
      coalesce(new.business_name, 'A vendor') || ' requested the verified badge.',
      '/verifications'
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists trg_vvr_notify_admins on public.vendor_verification_requests;
create trigger trg_vvr_notify_admins
  after insert or update of status on public.vendor_verification_requests
  for each row execute function public.notify_admins_verification_request();

-- Admin decision in one call: flips status, stamps the badge (and
-- optionally Insured) on every listing the vendor owns, and notifies
-- the vendor (push fans out via notifications_fanout_push).
create or replace function public.admin_decide_verification(
  p_request_id uuid,
  p_status text,
  p_note text default null,
  p_insured boolean default false
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.vendor_verification_requests%rowtype;
begin
  if not exists (select 1 from public.user_roles
                 where user_id = auth.uid() and role = 'admin') then
    raise exception 'admin only';
  end if;
  if p_status not in ('approved','needs_info','rejected') then
    raise exception 'invalid status';
  end if;
  select * into v_req from public.vendor_verification_requests where id = p_request_id;
  if not found then raise exception 'request not found'; end if;

  update public.vendor_verification_requests
     set status = p_status,
         admin_note = p_note,
         reviewed_at = now(),
         updated_at = now()
   where id = p_request_id;

  if p_status = 'approved' then
    update public.vendor_profiles
       set verified_at = coalesce(verified_at, now()),
           insured_at = case when p_insured then coalesce(insured_at, now()) else insured_at end
     where user_id = v_req.user_id;
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_req.user_id,
    'verification_' || p_status,
    case p_status
      when 'approved' then 'You''re verified! ✦'
      when 'needs_info' then 'Verification — we need a little more'
      else 'Verification update'
    end,
    case p_status
      when 'approved' then 'Your verified badge is now live on your public profile.'
      when 'needs_info' then coalesce('We need additional information: ' || p_note, 'We need additional information before we can approve your request.')
      else coalesce(p_note, 'Your verification request was not approved this time.')
    end,
    '/vendor/verification'
  );
end;
$$;
grant execute on function public.admin_decide_verification(uuid, text, text, boolean) to authenticated;
