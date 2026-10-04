-- Supabase advisor "function_search_path_mutable": pin search_path on the
-- trigger helpers that inherited the caller's. `extensions` is included
-- because tg_host_events_set_share_token calls gen_random_bytes (pgcrypto).
-- Skips any function that doesn't exist (local replays, later drops).
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.vendor_invoice_defaults_touch()',
    'public.vendor_document_defaults_touch()',
    'public.vendor_email_domains_touch()',
    'public.vendor_customers_touch()',
    'public.vendor_disputes_touch()',
    'public.vendor_recurring_invoices_touch()',
    'public.tg_host_events_touch_updated_at()',
    'public.tg_host_events_set_share_token()',
    'public.profiles_sync_logo_to_vendor()',
    'public.vendor_expenses_touch_updated_at()',
    'public.vendor_contractors_touch_updated_at()',
    'public.ai_sites_touch_updated()',
    'public.vendor_recurring_expenses_touch()'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s set search_path = public, extensions', fn);
    end if;
  end loop;
end $$;
