-- Per-vendor verified sending domain. When a row exists with
-- status='verified', buyer-receipt emails go out from
-- noreply@<domain> with the vendor's business name as the From
-- display, instead of the platform's invoices@eventvendora.com.
--
-- Managed by the vendorapay-email-domain edge function which
-- proxies the Resend Domains API. We store the Resend domain id
-- so verification polls and deletions hit the right resource;
-- dns_records caches the records Resend told us to set so the
-- vendor doesn't see a flash of "unknown" while we re-fetch.

create table if not exists public.vendor_email_domains (
  vendor_id uuid primary key references public.vendor_profiles(id) on delete cascade,
  domain text not null,
  resend_domain_id text not null,
  dns_records jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_email_domains enable row level security;

drop policy if exists "vendor_email_domains owner read" on public.vendor_email_domains;
create policy "vendor_email_domains owner read" on public.vendor_email_domains
  for select
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_email_domains.vendor_id
        and vp.user_id = auth.uid()
    )
  );

-- No client-side INSERT/UPDATE/DELETE — those go through the
-- vendorapay-email-domain edge function (service role).

create or replace function public.vendor_email_domains_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vendor_email_domains_touch_trg on public.vendor_email_domains;
create trigger vendor_email_domains_touch_trg
  before update on public.vendor_email_domains
  for each row execute function public.vendor_email_domains_touch();
