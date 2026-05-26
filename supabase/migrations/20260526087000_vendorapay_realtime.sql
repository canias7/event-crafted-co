-- VendoraPay realtime: stream invoice + payment_link UPDATEs to
-- the vendor's dashboard so a Stripe-driven status flip (sent ->
-- paid, paid -> refunded, etc.) appears without the vendor needing
-- to hit Refresh. RLS still gates which rows each client sees;
-- the publication just makes the change-stream available.

alter publication supabase_realtime add table public.invoices;
alter publication supabase_realtime add table public.payment_links;
