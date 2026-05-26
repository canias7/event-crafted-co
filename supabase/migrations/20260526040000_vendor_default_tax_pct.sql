-- Default sales tax percentage per listing. Lets vendors save the
-- tax rate they typically apply (e.g. 7.25 for North Carolina) on
-- the invoice template so every invoice they send starts with it
-- pre-filled. Stored as numeric(5,2) so we can carry 0-999.99 with
-- two decimal places.

alter table public.vendor_profiles
  add column if not exists default_tax_pct numeric(5,2) not null default 0;

comment on column public.vendor_profiles.default_tax_pct is
  'Default sales tax percentage (e.g. 7.25 for 7.25%) used as the starting point on this listing''s invoice template.';
