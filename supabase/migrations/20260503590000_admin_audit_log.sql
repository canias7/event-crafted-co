-- Admin audit log. Records every admin action that affects another
-- user's data — verifying a vendor, hiding a review, resolving a
-- ticket, importing vendors, force-closing an inquiry, etc.
--
-- Compliance + trust: when a vendor asks "why was my profile hidden",
-- support has a record of who did what and when. Also catches a
-- bad-actor admin acting outside protocol.
--
-- Logging is opt-in per call site — admins write directly to this
-- table, or we add triggers on the high-stakes tables (vendor_profiles
-- verified_at, vendor_verifications status, reviews hidden_at,
-- support_tickets status). For v1 we ship the table + viewer + a few
-- canonical triggers; new admin actions can log themselves manually
-- via the helper RPC.

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_admin_idx on public.admin_audit_log (admin_id, created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id, created_at desc);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log admin select"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin());

create policy "admin_audit_log admin insert"
  on public.admin_audit_log for insert to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

-- Helper: log an admin action from any RPC. Called by triggers on the
-- high-stakes tables below + can be called manually from edge functions.
create or replace function public.log_admin_action(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Skip if the actor isn't admin (no-op for self-actions by users).
  if not public.is_admin() then return; end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_summary, p_metadata);
end$$;

grant execute on function public.log_admin_action(text, text, uuid, text, jsonb) to authenticated;

-- Trigger on vendor_profiles: log when verified_at changes.
create or replace function public.audit_vendor_verified_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.verified_at is distinct from old.verified_at and public.is_admin() then
    insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
    values (
      auth.uid(),
      case when new.verified_at is null then 'vendor_unverified' else 'vendor_verified' end,
      'vendor_profile',
      new.id,
      coalesce(new.business_name, '(unnamed vendor)'),
      jsonb_build_object('previous_verified_at', old.verified_at, 'new_verified_at', new.verified_at)
    );
  end if;
  return new;
end$$;

drop trigger if exists vendor_profiles_audit on public.vendor_profiles;
create trigger vendor_profiles_audit
  after update of verified_at on public.vendor_profiles
  for each row execute function public.audit_vendor_verified_change();

-- Trigger on vendor_verifications status flips by admin.
create or replace function public.audit_verification_decision()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_business text;
begin
  if new.status is distinct from old.status and public.is_admin() then
    select business_name into v_business
      from public.vendor_profiles where id = new.vendor_id;
    insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
    values (
      auth.uid(),
      'verification_' || new.status,
      'vendor_verification',
      new.id,
      coalesce(v_business, '(unnamed vendor)') || ' · ' || new.kind,
      jsonb_build_object('previous_status', old.status, 'new_status', new.status, 'kind', new.kind, 'notes', new.notes)
    );
  end if;
  return new;
end$$;

drop trigger if exists vendor_verifications_audit on public.vendor_verifications;
create trigger vendor_verifications_audit
  after update of status on public.vendor_verifications
  for each row execute function public.audit_verification_decision();

-- Trigger on reviews when admin hides one.
create or replace function public.audit_review_hidden()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.hidden_at is distinct from old.hidden_at and public.is_admin() then
    insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
    values (
      auth.uid(),
      case when new.hidden_at is null then 'review_unhidden' else 'review_hidden' end,
      'review',
      new.id,
      substring(coalesce(new.body, '(no body)') for 100),
      jsonb_build_object('reason', new.hidden_reason)
    );
  end if;
  return new;
end$$;

drop trigger if exists reviews_audit on public.reviews;
create trigger reviews_audit
  after update of hidden_at on public.reviews
  for each row execute function public.audit_review_hidden();

-- Trigger on support tickets when admin updates status.
create or replace function public.audit_support_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status and public.is_admin() then
    insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
    values (
      auth.uid(),
      'support_ticket_' || new.status,
      'support_ticket',
      new.id,
      new.subject,
      jsonb_build_object('previous_status', old.status, 'new_status', new.status)
    );
  end if;
  return new;
end$$;

drop trigger if exists support_tickets_audit on public.support_tickets;
create trigger support_tickets_audit
  after update of status on public.support_tickets
  for each row execute function public.audit_support_status();

revoke execute on function public.audit_vendor_verified_change() from public, anon, authenticated;
revoke execute on function public.audit_verification_decision() from public, anon, authenticated;
revoke execute on function public.audit_review_hidden() from public, anon, authenticated;
revoke execute on function public.audit_support_status() from public, anon, authenticated;
