-- Sidebar shows the vendor's live credit balance next to the Usage
-- nav row. Same realtime opt-in pattern we used for vendor_profiles:
-- add the table to supabase_realtime so postgres_changes UPDATE
-- events on vendor_credit_balances reach subscribed clients (RLS
-- still scopes deliveries to the row's user_id).
alter publication supabase_realtime add table public.vendor_credit_balances;
