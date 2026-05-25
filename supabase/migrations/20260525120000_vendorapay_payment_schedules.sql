-- VendoraPay payment schedules. Splits one charge into a deposit
-- (pay now) + a balance (pay later) by creating two linked rows in
-- payment_links.
--
--   parent_link_id  → balance row points at the deposit row
--   activate_at     → balance row sits at status='scheduled' until
--                     this date, then a daily cron flips to 'active'
--                     and emails the host a reminder.
--
-- Both rows live independently after activation — same checkout
-- flow, same webhook handling. No new payment-flow code needed.

alter table public.payment_links
  add column if not exists parent_link_id uuid references public.payment_links(id) on delete set null,
  add column if not exists activate_at timestamptz;

create index if not exists payment_links_parent_idx
  on public.payment_links(parent_link_id);
create index if not exists payment_links_scheduled_activate_idx
  on public.payment_links(activate_at)
  where status = 'scheduled';

-- Add 'scheduled' to the allowed status set.
alter table public.payment_links
  drop constraint if exists payment_links_status_check;
alter table public.payment_links
  add constraint payment_links_status_check
  check (status in ('active', 'paid', 'cancelled', 'expired', 'scheduled'));

-- RPC unchanged in behavior (still filters status='active') but
-- recreated to be explicit that 'scheduled' links can't be paid
-- early via the public checkout.
create or replace function public.get_payment_link_for_checkout(p_slug text)
returns table (
  id uuid,
  vendor_id uuid,
  title text,
  description text,
  amount_cents integer,
  currency text,
  status text,
  vendor_business_name text,
  vendor_logo_url text
) language sql stable security definer set search_path = public as $$
  select
    pl.id,
    pl.vendor_id,
    pl.title,
    pl.description,
    pl.amount_cents,
    pl.currency,
    pl.status,
    vp.business_name,
    vp.logo_url
  from public.payment_links pl
  join public.vendor_profiles vp on vp.id = pl.vendor_id
  where pl.slug = p_slug
    and pl.status = 'active'
    and (pl.expires_at is null or pl.expires_at > now())
  limit 1;
$$;

-- Daily cron: promote scheduled balance links + email host the reminder.
-- (Idempotent: status flip is gated on status='scheduled'.)
select cron.schedule(
  'scan-vendorapay-payment-schedules-daily',
  '0 8 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendorapay-payment-schedules',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
)
where not exists (
  select 1 from cron.job where jobname = 'scan-vendorapay-payment-schedules-daily'
);
