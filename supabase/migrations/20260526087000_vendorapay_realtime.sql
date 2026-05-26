-- VendoraPay realtime: stream invoice + payment_link UPDATEs to
-- the vendor's dashboard so a Stripe-driven status flip (sent ->
-- paid, paid -> refunded, etc.) appears without the vendor needing
-- to hit Refresh. RLS still gates which rows each client sees;
-- the publication just makes the change-stream available.
--
-- Wrapped in DO blocks so a re-run (preview branch redeploy,
-- supabase db reset, partial-apply retry) doesn't fail with
-- "table X is already member of publication supabase_realtime".

do $$
begin
  alter publication supabase_realtime add table public.invoices;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.payment_links;
exception
  when duplicate_object then null;
end
$$;
