-- Shareable proposal link via tokenized URL. Vendor turns sharing
-- on for one proposal; recipient opens /p/:token in a browser
-- without signing in. Read-only — accept/reject still requires
-- the host's authenticated session because RLS gates writes.
--
-- Two new columns on proposals:
--   share_token         — random hex; only set when sharing is on
--   share_enabled_at    — when sharing was activated (null = off)
-- Toggle by setting/clearing share_token via the
-- toggle_proposal_share RPC.

alter table public.proposals
  add column if not exists share_token text,
  add column if not exists share_enabled_at timestamptz;

create unique index if not exists proposals_share_token_idx
  on public.proposals (share_token)
  where share_token is not null;

-- Toggle share on/off. Vendor-only; we resolve the vendor membership
-- from the proposal row, then either set/clear the token.
create or replace function public.toggle_proposal_share(
  p_proposal_id uuid,
  p_enabled boolean
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_vendor_id uuid;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select vendor_id into v_vendor_id
    from public.proposals
    where id = p_proposal_id;
  if v_vendor_id is null then
    raise exception 'proposal not found';
  end if;
  if not exists (
    select 1 from public.vendor_profiles vp
    where vp.id = v_vendor_id and vp.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  if p_enabled then
    select share_token into v_token
      from public.proposals
      where id = p_proposal_id;
    if v_token is null then
      v_token := encode(gen_random_bytes(12), 'hex');
      update public.proposals
        set share_token = v_token,
            share_enabled_at = now()
        where id = p_proposal_id;
    end if;
    return v_token;
  else
    update public.proposals
      set share_token = null,
          share_enabled_at = null
      where id = p_proposal_id;
    return null;
  end if;
end;
$$;

grant execute on function public.toggle_proposal_share(uuid, boolean)
  to authenticated;

-- Public RPC: fetch the proposal by share token. Returns the same
-- shape as a host-authenticated read, but anyone with the link can
-- view. Returns null when token is invalid.
create or replace function public.get_proposal_by_share_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
stable
as $$
declare
  v jsonb;
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

grant execute on function public.get_proposal_by_share_token(text)
  to anon, authenticated;
