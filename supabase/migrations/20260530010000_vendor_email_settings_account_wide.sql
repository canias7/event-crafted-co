-- Account-wide opt-in for outbound vendor->client emails.
--
-- Supersedes the per-listing vendor_profiles.email_sending_enabled flag
-- (added in 20260530000000) with a single per-account switch keyed by
-- the owner's user_id. Until an account turns this on, every
-- vendor->client email (invoice sends, paid receipts, overdue +
-- balance-due reminders) is blocked and NOT billed. Platform/admin
-- notifications are unaffected.
create table if not exists vendor_email_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sending_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vendor_email_settings enable row level security;

create policy "owner reads own email settings"
  on vendor_email_settings for select
  using (auth.uid() = user_id);

create policy "owner inserts own email settings"
  on vendor_email_settings for insert
  with check (auth.uid() = user_id);

create policy "owner updates own email settings"
  on vendor_email_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Grandfather accounts that already send client emails so the new gate
-- doesn't silently stop flows that already work.
insert into vendor_email_settings (user_id, sending_enabled)
select distinct vp.user_id, true
  from vendor_profiles vp
 where vp.user_id is not null
   and (
     exists (select 1 from invoices i
              where i.vendor_id = vp.id and i.sent_at is not null)
     or exists (select 1 from vendor_email_domains d
                 where d.vendor_id = vp.id)
   )
on conflict (user_id) do nothing;

-- Retire the per-listing flag in favor of the account-wide setting.
alter table vendor_profiles drop column if exists email_sending_enabled;
