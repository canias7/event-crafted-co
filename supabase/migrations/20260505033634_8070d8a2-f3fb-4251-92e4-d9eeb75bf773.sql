insert into storage.buckets (id, name, public) values ('vendor-verifications', 'vendor-verifications', false) on conflict (id) do nothing;

create policy "vendor verifications owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-verifications' and exists (select 1 from public.vendor_profiles vp where vp.id::text = (storage.foldername(name))[1] and vp.user_id = auth.uid()));

create policy "vendor verifications owner read"
  on storage.objects for select to authenticated
  using (bucket_id = 'vendor-verifications' and (
    exists (select 1 from public.vendor_profiles vp where vp.id::text = (storage.foldername(name))[1] and vp.user_id = auth.uid())
    or exists (select 1 from public.profiles ur where ur.id = auth.uid() and ur.role = 'admin')
  ));

create policy "vendor verifications owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-verifications' and exists (select 1 from public.vendor_profiles vp where vp.id::text = (storage.foldername(name))[1] and vp.user_id = auth.uid()));

create table public.vendor_verifications (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  kind text not null check (kind in ('identity','insurance','business_license','background_check')),
  document_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes text,
  expires_at date,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (vendor_id, kind)
);

create index vendor_verifications_status_idx on public.vendor_verifications (status, submitted_at desc);

alter table public.vendor_verifications enable row level security;

create policy "vendor_verifications vendor select" on public.vendor_verifications for select to authenticated
  using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "vendor_verifications vendor upsert" on public.vendor_verifications for insert to authenticated
  with check (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "vendor_verifications vendor update" on public.vendor_verifications for update to authenticated
  using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "vendor_verifications admin all" on public.vendor_verifications for all to authenticated
  using (exists (select 1 from public.profiles ur where ur.id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.profiles ur where ur.id = auth.uid() and ur.role = 'admin'));

create view public.vendor_public_badges with (security_invoker = true) as
  select vendor_id, array_agg(kind order by kind) as kinds
  from public.vendor_verifications
  where status = 'approved' and (expires_at is null or expires_at >= current_date)
  group by vendor_id;

grant select on public.vendor_public_badges to anon, authenticated;

create or replace function public.notify_admins_new_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_vendor_name text; r record;
begin
  if new.status <> 'pending' then return new; end if;
  select coalesce(business_name, 'A vendor') into v_vendor_name from public.vendor_profiles where id = new.vendor_id;
  for r in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (user_id, type, title, body, link)
    values (r.id, 'verification_submitted', 'Verification to review', v_vendor_name || ' submitted a ' || new.kind || ' document.', '/admin/verifications');
  end loop;
  return new;
end$$;

drop trigger if exists vendor_verifications_notify_admins on public.vendor_verifications;
create trigger vendor_verifications_notify_admins after insert on public.vendor_verifications
  for each row execute function public.notify_admins_new_verification();

create or replace function public.notify_vendor_verification_decided()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if new.status = old.status then return new; end if;
  if new.status not in ('approved','rejected') then return new; end if;
  select user_id into v_user from public.vendor_profiles where id = new.vendor_id;
  if v_user is null then return new; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (v_user, 'verification_' || new.status,
    case new.status when 'approved' then 'Verification approved' else 'Verification needs another look' end,
    case new.status when 'approved' then 'Your ' || new.kind || ' is verified — the badge is now on your profile.'
                    else 'Your ' || new.kind || ' submission was returned. ' || coalesce('Reason: ' || new.notes, '') end,
    '/vendor/profile');
  return new;
end$$;

drop trigger if exists vendor_verifications_notify_vendor on public.vendor_verifications;
create trigger vendor_verifications_notify_vendor after update of status on public.vendor_verifications
  for each row execute function public.notify_vendor_verification_decided();

revoke execute on function public.notify_admins_new_verification() from public, anon, authenticated;
revoke execute on function public.notify_vendor_verification_decided() from public, anon, authenticated;