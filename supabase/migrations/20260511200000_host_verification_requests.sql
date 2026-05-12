-- Host verification: hosts can request identity verification so
-- vendors prioritize their inquiries. This is the lightweight version
-- shipped via OTA -- the user submits a request row, admins follow up
-- via support to collect ID docs out-of-band. A future native build
-- will add an in-app document upload step.
--
-- One open request per host (unique partial index where status =
-- 'pending'). Re-applying after a decision creates a fresh row so
-- the audit trail stays append-only.

create table if not exists public.host_verification_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewer_id  uuid references auth.users(id) on delete set null,
  notes        text
);

create index if not exists host_verification_requests_user_idx
  on public.host_verification_requests (user_id);

create unique index if not exists host_verification_one_open_per_user
  on public.host_verification_requests (user_id)
  where status = 'pending';

alter table public.host_verification_requests enable row level security;

drop policy if exists "host_verifications self read"   on public.host_verification_requests;
drop policy if exists "host_verifications self insert" on public.host_verification_requests;
drop policy if exists "host_verifications admin read"  on public.host_verification_requests;
drop policy if exists "host_verifications admin write" on public.host_verification_requests;

create policy "host_verifications self read"
  on public.host_verification_requests for select to authenticated
  using (auth.uid() = user_id);

create policy "host_verifications self insert"
  on public.host_verification_requests for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');

create policy "host_verifications admin read"
  on public.host_verification_requests for select to authenticated
  using (public.is_admin());

create policy "host_verifications admin write"
  on public.host_verification_requests for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Notify admins on insert so they can review.
create or replace function public.notify_admins_host_verification()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare v_name text;
begin
  select coalesce(p.display_name, 'A host') into v_name
    from public.profiles p where p.id = new.user_id;
  insert into public.notifications (user_id, type, title, body, link)
  select
    ur.user_id,
    'host_verification_requested',
    'Host verification requested',
    v_name || ' is asking for identity verification.',
    '/admin/users/' || new.user_id::text
  from public.user_roles ur
  where ur.role = 'admin';
  return new;
end$function$;

drop trigger if exists host_verifications_notify_admin
  on public.host_verification_requests;
create trigger host_verifications_notify_admin
  after insert on public.host_verification_requests
  for each row execute function public.notify_admins_host_verification();

revoke execute on function public.notify_admins_host_verification()
  from public, anon, authenticated, service_role;
