-- Group gift tracking: hosts post gift "wishes" with a target amount,
-- guests pledge contributions toward them. We track pledges (not actual
-- payments — Stripe isn't wired) so the host can see who's contributing
-- and follow up off-platform.
--
-- Public read on gifts so guests with the registry share link can view
-- without auth. Pledges are write-anonymous for guests (their email +
-- name + amount, no auth required) — same trust model as RSVPs.

create table public.gift_wishes (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  target_cents integer,           -- nullable — open contribution
  image_url text,
  source_url text,                -- "buy from amazon" link
  share_token text not null unique
    default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gift_wishes_host_idx
  on public.gift_wishes (host_id, created_at desc);

create index gift_wishes_token_idx
  on public.gift_wishes (share_token);

alter table public.gift_wishes enable row level security;

create policy "gift_wishes public read"
  on public.gift_wishes for select using (true);

create policy "gift_wishes host insert"
  on public.gift_wishes for insert to authenticated
  with check (auth.uid() = host_id);

create policy "gift_wishes host update"
  on public.gift_wishes for update to authenticated
  using (auth.uid() = host_id);

create policy "gift_wishes host delete"
  on public.gift_wishes for delete to authenticated
  using (auth.uid() = host_id);

create trigger gift_wishes_updated
  before update on public.gift_wishes
  for each row execute function public.tg_set_updated_at();

create table public.gift_pledges (
  id uuid primary key default gen_random_uuid(),
  wish_id uuid not null references public.gift_wishes(id) on delete cascade,
  contributor_name text not null,
  contributor_email text,
  amount_cents integer not null check (amount_cents > 0),
  message text,
  created_at timestamptz not null default now()
);

create index gift_pledges_wish_idx
  on public.gift_pledges (wish_id, created_at desc);

alter table public.gift_pledges enable row level security;

-- Public insert via SECURITY DEFINER RPC below — bypasses RLS so
-- anonymous contributors don't need auth.
-- Host (and only host) reads pledges on their own wishes.
create policy "gift_pledges host select"
  on public.gift_pledges for select to authenticated
  using (
    exists (
      select 1 from public.gift_wishes w
      where w.id = wish_id and w.host_id = auth.uid()
    )
  );

create policy "gift_pledges host delete"
  on public.gift_pledges for delete to authenticated
  using (
    exists (
      select 1 from public.gift_wishes w
      where w.id = wish_id and w.host_id = auth.uid()
    )
  );

-- Public insert RPC: anonymous guests pledge against a wish via its
-- share token. Returns the pledge id.
create or replace function public.pledge_to_gift(
  p_token text,
  p_name text,
  p_amount_cents int,
  p_email text default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wish_id uuid;
  v_pledge_id uuid;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'name_required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount';
  end if;

  select id into v_wish_id
  from public.gift_wishes
  where share_token = p_token;
  if v_wish_id is null then
    raise exception 'wish_not_found';
  end if;

  insert into public.gift_pledges (wish_id, contributor_name, contributor_email, amount_cents, message)
  values (v_wish_id, trim(p_name), nullif(trim(coalesce(p_email, '')), ''), p_amount_cents, nullif(trim(coalesce(p_message, '')), ''))
  returning id into v_pledge_id;

  return v_pledge_id;
end$$;

grant execute on function public.pledge_to_gift(text, text, int, text, text)
  to anon, authenticated;

-- Public lookup of a wish + pledged total + contributor list (anonymized
-- for non-host viewers). Used by the public share page.
create or replace function public.get_gift_wish_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wish public.gift_wishes;
  v_pledged int;
  v_contributors jsonb;
begin
  select * into v_wish from public.gift_wishes where share_token = p_token;
  if v_wish.id is null then
    return null;
  end if;

  select coalesce(sum(amount_cents), 0)::int into v_pledged
  from public.gift_pledges where wish_id = v_wish.id;

  -- Contributor list — show names + amounts (no emails) so guests can see
  -- who's already pitched in.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', contributor_name,
      'amount_cents', amount_cents,
      'message', message,
      'created_at', created_at
    ) order by created_at desc
  ), '[]'::jsonb)
  into v_contributors
  from public.gift_pledges where wish_id = v_wish.id;

  return jsonb_build_object(
    'id', v_wish.id,
    'title', v_wish.title,
    'description', v_wish.description,
    'target_cents', v_wish.target_cents,
    'image_url', v_wish.image_url,
    'source_url', v_wish.source_url,
    'pledged_cents', v_pledged,
    'contributors', v_contributors
  );
end$$;

grant execute on function public.get_gift_wish_by_token(text) to anon, authenticated;
