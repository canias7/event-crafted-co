-- Sent proposal instances: a token-gated public page (/proposal/:token) the
-- client opens and accepts. Mirrors vendor_contracts, minus the e-sign/OTP
-- rigor — accepting a proposal is a soft "let's proceed"; the binding step is
-- the contract that follows.
create table if not exists public.vendor_proposals (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  template_id uuid,
  title text not null,
  body text not null,
  recipient_name text,
  status text not null default 'sent',  -- sent | accepted | declined
  view_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  accepted_name text,
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.vendor_proposals enable row level security;

drop policy if exists "vendor_proposals member all" on public.vendor_proposals;
create policy "vendor_proposals member all" on public.vendor_proposals
  for all using (is_vendor_member(vendor_id)) with check (is_vendor_member(vendor_id));

-- Column-lock writes (same model as vendor_contracts): clients may only insert
-- the fields the app supplies. status, view_token and the accepted_* columns
-- are set by defaults / the accept_proposal SECURITY DEFINER RPC (runs as table
-- owner). No client UPDATE path exists.
revoke insert, update on public.vendor_proposals from authenticated, anon;
grant insert (vendor_id, inquiry_id, template_id, title, body, recipient_name)
  on public.vendor_proposals to authenticated;

-- Public read of a proposal by its token (no auth — the client opening the link).
create or replace function public.get_proposal_for_viewing(p_token text)
returns table(
  id uuid, title text, body text, status text, recipient_name text,
  accepted_name text, accepted_at timestamptz, vendor_business_name text
)
language sql stable security definer set search_path to 'public'
as $function$
  select c.id, c.title, c.body, c.status, c.recipient_name,
         c.accepted_name, c.accepted_at, vp.business_name
  from public.vendor_proposals c
  join public.vendor_profiles vp on vp.id = c.vendor_id
  where c.view_token = p_token
  limit 1;
$function$;

-- Record acceptance and notify the vendor's team.
create or replace function public.accept_proposal(p_token text, p_name text)
returns text
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; v_status text; v_vendor uuid; v_inquiry uuid; v_title text;
begin
  select id, status, vendor_id, inquiry_id, title
    into v_id, v_status, v_vendor, v_inquiry, v_title
    from public.vendor_proposals where view_token = p_token for update;
  if v_id is null then raise exception 'proposal_not_found'; end if;
  if v_status <> 'sent' then return v_status; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'name_required'; end if;
  update public.vendor_proposals
    set status = 'accepted', accepted_name = btrim(p_name),
        accepted_at = now(), accepted_user_id = (select auth.uid())
    where id = v_id;
  insert into public.notifications (user_id, type, title, body, link)
  select m.user_id, 'proposal_accepted',
    btrim(p_name) || ' accepted "' || v_title || '"',
    'Your proposal was accepted.',
    coalesce('/vendor/inbox/' || v_inquiry::text, '/vendor/workspace?tab=files')
  from public.vendor_team_members m where m.vendor_id = v_vendor;
  return 'accepted';
end;
$function$;

grant execute on function public.get_proposal_for_viewing(text) to anon, authenticated;
grant execute on function public.accept_proposal(text, text) to anon, authenticated;
