-- Stripe chargebacks captured by vendorapay-webhook. Vendor responds
-- to disputes inside Stripe Express; this table is the in-app
-- surface so they see open vs resolved at a glance.
--
-- vendor_id is nullable: if the original charge can't be tied back
-- to a vendor record at insert time (rare — only if the source
-- invoice/link/proposal was deleted), we still keep the row for
-- ops triage.

create table if not exists public.vendor_disputes (
  id uuid primary key default gen_random_uuid(),
  stripe_dispute_id text not null unique,
  vendor_id uuid references public.vendor_profiles(id) on delete set null,
  charge_id text not null,
  payment_intent_id text,
  amount_cents integer not null,
  currency text not null default 'usd',
  reason text,
  status text not null,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_disputes_vendor_idx
  on public.vendor_disputes (vendor_id, created_at desc);

alter table public.vendor_disputes enable row level security;

drop policy if exists "vendor_disputes owner read" on public.vendor_disputes;
create policy "vendor_disputes owner read" on public.vendor_disputes
  for select
  using (
    vendor_id is not null
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_disputes.vendor_id
        and vp.user_id = auth.uid()
    )
  );

-- Writes only via service role (webhook + ops). No client policy.

create or replace function public.vendor_disputes_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vendor_disputes_touch_trg on public.vendor_disputes;
create trigger vendor_disputes_touch_trg
  before update on public.vendor_disputes
  for each row execute function public.vendor_disputes_touch();
