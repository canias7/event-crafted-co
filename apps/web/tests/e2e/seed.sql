-- ─────────────────────────────────────────────────────────────────────────
--  E2E fixture seed  (idempotent — safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────
--
--  The Playwright smoke suite runs against the REAL Supabase project (when the
--  E2E_* secrets are set — see README.md), and several specs depend on fixed
--  fixture data living in that project:
--
--    • checkout.spec.ts → /pay/link/e2e-pay-link   ("E2E Test — Event Deposit", $250.00)
--                         /pay/invoice/e2e-invoice  ($1,299.00, "Wedding photography package")
--    • rls.spec.ts      → the throwaway vendor owns a listing with >50 inquiries,
--                         host-1 owns a strict subset, anon sees none.
--
--  This data is NOT created by any migration — it lives only in the E2E target
--  project. If it gets wiped, those specs fail with "Invoice not found" /
--  "vendor should own a listing" and CI goes red with no code cause. Re-apply
--  this script to restore the fixtures.
--
--  HOW TO APPLY (service-role / SQL editor on the E2E target project):
--    psql "$E2E_DATABASE_URL" -f apps/web/tests/e2e/seed.sql
--    -- or paste into the Supabase SQL editor, or run via the Supabase MCP.
--
--  PREREQUISITE: the two throwaway auth users must already exist (they are the
--  accounts referenced by E2E_VENDOR_EMAIL / the host the suite signs in as):
--    • e2e-vendor@eventvendora.test   (E2E_VENDOR_EMAIL)
--    • e2e-host-1@eventvendora.test
--  Create them once via the Auth admin API if missing; this script only seeds
--  their application data.
--
--  WHY session_replication_role = replica: it disables app triggers for the
--  seeding inserts so we don't (a) fan out 68 push notifications, (b) fire the
--  geocode HTTP call, or (c) get application_status silently coerced — and it
--  lets us set every column deterministically. Cleanup runs with triggers on
--  so FK cascades behave normally.
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  v_vendor  uuid;
  v_host1   uuid;
  -- Fixed fixture ids so re-runs replace in place rather than accumulate.
  v_listing uuid := 'e2e0e2e0-0000-4000-a000-000000000001';
  v_paylink uuid := 'e2e0e2e0-0000-4000-a000-000000000002';
  v_invoice uuid := 'e2e0e2e0-0000-4000-a000-000000000003';
begin
  select id into v_vendor from auth.users where email = 'e2e-vendor@eventvendora.test';
  select id into v_host1  from auth.users where email = 'e2e-host-1@eventvendora.test';
  if v_vendor is null or v_host1 is null then
    raise exception
      'E2E seed: missing auth users. Need e2e-vendor@eventvendora.test and e2e-host-1@eventvendora.test (create via Auth admin API first).';
  end if;

  -- ── 1. Cleanup (triggers ON → FK cascades clean child rows) ──────────────
  delete from public.invoices       where slug = 'e2e-invoice';
  delete from public.payment_links  where slug = 'e2e-pay-link';
  delete from public.vendor_profiles where id = v_listing;   -- cascades its inquiries

  -- ── 2. Seed (triggers OFF for the inserts) ───────────────────────────────
  perform set_config('session_replication_role', 'replica', true);

  -- The throwaway vendor is a vendor, not a host.
  update public.profiles set role = 'vendor' where id = v_vendor;

  -- Vendor listing. application_status = 'pending' keeps it owner-readable
  -- (auth.uid() = user_id) but hidden from anon (anon needs 'approved'),
  -- which is exactly what rls.spec.ts asserts. vendor_team_members is a VIEW
  -- over this row, so creating it also grants the owner team membership.
  insert into public.vendor_profiles
    (id, user_id, business_name, category, location, slug, application_status, logo_url, created_at, updated_at)
  values
    (v_listing, v_vendor, 'E2E Test Vendor', 'photography', 'New York, NY',
     'e2e-test-vendor', 'pending', 'https://placehold.co/240x240?text=E2E', now(), now());

  -- 60 inquiries owned by host-1 (host RLS lets host-1 see exactly these).
  insert into public.inquiries
    (host_id, vendor_id, event_type, event_date, guest_count, location, status, created_at, updated_at, last_message_at)
  select v_host1, v_listing,
         (array['wedding','birthday','holiday_dinner','other'])[1 + (g % 4)],
         current_date + (g % 45), 25 + (g % 150), 'New York, NY', 'new',
         now() - (g || ' days')::interval, now() - (g || ' days')::interval, now() - (g || ' days')::interval
  from generate_series(1, 60) g;

  -- 8 inquiries owned by a different host so the vendor's total (68) strictly
  -- exceeds host-1's visible count (60) — rls.spec.ts asserts host < vendor.
  -- The vendor uid doubles as that "other host" purely as throwaway fixture
  -- data (avoids standing up extra auth users); no spec inspects who it is.
  insert into public.inquiries
    (host_id, vendor_id, event_type, status, created_at, updated_at, last_message_at)
  select v_vendor, v_listing, 'other', 'new',
         now() - (g || ' days')::interval, now() - (g || ' days')::interval, now() - (g || ' days')::interval
  from generate_series(1, 8) g;

  -- Pay-link fixture → /pay/link/e2e-pay-link
  insert into public.payment_links
    (id, vendor_id, slug, title, description, amount_cents, currency, status, collect_contact, created_by, created_at, updated_at)
  values
    (v_paylink, v_listing, 'e2e-pay-link', 'E2E Test — Event Deposit',
     'Deposit to reserve your event date', 25000, 'usd', 'active', false, v_vendor, now(), now());

  -- Invoice fixture → /pay/invoice/e2e-invoice
  insert into public.invoices
    (id, vendor_id, slug, invoice_number, bill_to_name, bill_to_email, issue_date, due_date, notes,
     line_items, subtotal_cents, tax_rate_bps, tax_cents, total_cents, currency, status, created_by, created_at, updated_at)
  values
    (v_invoice, v_listing, 'e2e-invoice', 'INV-E2E-0001', 'E2E Buyer', 'e2e-host-1@eventvendora.test',
     current_date, current_date + 30, 'Thank you for your business.',
     '[{"name":"Wedding photography package","qty":1,"unit_price_cents":129900,"total_cents":129900}]'::jsonb,
     129900, 0, 0, 129900, 'usd', 'sent', v_vendor, now(), now());
end $$;
