-- ON CONFLICT (user_id, email) can't reliably infer a PARTIAL unique
-- index via PostgREST upsert, so make the account-level contact
-- uniqueness a plain unique index. NULL user_id rows (legacy
-- listing-only) stay allowed since NULLs are distinct in a unique index.
drop index if exists public.vendor_customers_user_email_idx;
create unique index if not exists vendor_customers_user_email_idx
  on public.vendor_customers (user_id, email);
