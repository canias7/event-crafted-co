-- Vendora seed data
-- NOTE: requires the auth.users rows below to exist. For local dev with
-- `supabase db reset`, you can create the auth users via the Supabase Studio
-- UI, or via `supabase auth admin` CLI, then re-run this seed. The on-signup
-- trigger will populate public.profiles automatically. This script then
-- upgrades roles, fills out vendor_profiles, and creates inquiries.
--
-- Suggested test users (create via UI or CLI):
--   admin@vendora.test    pw: Password!1
--   sofia@vendora.test    pw: Password!1   (vendor)
--   marcus@vendora.test   pw: Password!1   (vendor)
--   alice@vendora.test    pw: Password!1   (host)
--   ben@vendora.test      pw: Password!1   (host)

do $$
declare
  v_admin uuid;
  v_sofia uuid;
  v_marcus uuid;
  v_alice uuid;
  v_ben uuid;
  vp_sofia uuid;
  vp_marcus uuid;
begin
  select id into v_admin  from auth.users where email = 'admin@vendora.test';
  select id into v_sofia  from auth.users where email = 'sofia@vendora.test';
  select id into v_marcus from auth.users where email = 'marcus@vendora.test';
  select id into v_alice  from auth.users where email = 'alice@vendora.test';
  select id into v_ben    from auth.users where email = 'ben@vendora.test';

  if v_admin is null or v_sofia is null or v_marcus is null or v_alice is null or v_ben is null then
    raise notice 'Seed users missing — create the test auth users first.';
    return;
  end if;

  update public.profiles set role = 'admin',  display_name = 'Admin Aria'  where id = v_admin;
  update public.profiles set role = 'vendor', display_name = 'Sofia Bloom' where id = v_sofia;
  update public.profiles set role = 'vendor', display_name = 'Marcus Lens' where id = v_marcus;
  update public.profiles set role = 'host',   display_name = 'Alice Reed'  where id = v_alice;
  update public.profiles set role = 'host',   display_name = 'Ben Carter'  where id = v_ben;

  insert into public.vendor_profiles (user_id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at)
  values (v_sofia, 'Bloom & Stem Florals', 'Florist',
          'Garden-style floral design for weddings and editorial events.',
          150000, 'Brooklyn, NY', 60,
          'Specializes in seasonal, garden-inspired arrangements with a focus on locally sourced blooms. Works with budgets from $1,500 to $25k.',
          now())
  returning id into vp_sofia;

  insert into public.vendor_profiles (user_id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at)
  values (v_marcus, 'Luminara Photography', 'Photographer',
          'Documentary-style wedding and event photography.',
          280000, 'Manhattan, NY', 100,
          'Documentary photographer with 8 years of experience. Known for natural light, candid coverage, and quick turnaround on edited galleries.',
          now())
  returning id into vp_marcus;

  insert into public.inquiries (host_id, vendor_id, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, status)
  values
    (v_alice, vp_sofia,  'wedding',        '2026-09-12', 120, 'Hudson Valley, NY', 400000, 700000,
      'Looking for garden-inspired centerpieces and an installation over the dance floor. Color palette: dusty rose, terracotta, cream.', 'new'),
    (v_alice, vp_marcus, 'wedding',        '2026-09-12', 120, 'Hudson Valley, NY', 350000, 600000,
      'Need full-day coverage with a second shooter. Want lots of candid family moments + sunset portraits.', 'new'),
    (v_ben,   vp_marcus, 'birthday',       '2026-07-04',  40, 'Brooklyn, NY',      80000,  150000,
      '40th birthday garden party. Looking for 4 hours of coverage and a same-day highlight slideshow.', 'new'),
    (v_ben,   vp_sofia,  'holiday_dinner', '2026-12-20',  18, 'Brooklyn, NY',      50000,  100000,
      'Intimate holiday dinner. Need a long table runner of greens and white candles in varying heights.', 'new');
end $$;