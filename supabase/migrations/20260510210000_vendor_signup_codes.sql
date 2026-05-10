-- Short-lived 6-digit codes for the vendor-app signup flow.
-- Cleared by the vendor-signup edge function on successful
-- verification or expiry.
create table public.vendor_signup_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.vendor_signup_codes enable row level security;
-- No policies — only the vendor-signup edge function (service role)
-- touches this table.
