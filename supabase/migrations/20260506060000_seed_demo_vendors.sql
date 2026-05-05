-- Seed one demo vendor per live category (28 total). Lets you see
-- the directory populated end-to-end without having to manually
-- create vendor signups for each category.
--
-- Demo vendors have user_id = NULL (no real auth user behind them)
-- and is_demo = true (so admin tools can filter them later). They
-- ship with application_status = 'approved' so they appear on the
-- public directory immediately. The 4 categories with structured
-- field schemas (Venue, Photographer, Videographer, Bridal Salon)
-- get populated category_attributes too — the others stay basic.
--
-- Idempotent: only inserts if no demo vendors exist yet.

-- 1. Allow nullable user_id. UNIQUE constraint still applies but
--    Postgres treats NULL as distinct in UNIQUE indexes by default,
--    so any number of demo vendors can coexist with NULL user_id.
alter table public.vendor_profiles
  alter column user_id drop not null;

-- 2. Mark demo / seed rows so admin can distinguish them later.
alter table public.vendor_profiles
  add column if not exists is_demo boolean not null default false;

create index if not exists vendor_profiles_demo_idx
  on public.vendor_profiles (is_demo)
  where is_demo = true;

-- 3. Seed 28 demo vendors, one per live category.
do $$
begin
  -- Skip if any demo data already exists. Lets the migration re-run
  -- safely without duplicating.
  if exists (select 1 from public.vendor_profiles where is_demo) then
    return;
  end if;

  insert into public.vendor_profiles (
    user_id, business_name, category, bio, base_price_cents,
    location, service_radius_miles, portfolio_summary,
    application_status, is_demo, category_attributes
  ) values
    -- ── 4 categories with rich category_attributes ──────────────────
    (
      null, 'The Hayloft at Crooked Creek', 'Venue',
      'A restored 1890s dairy barn on 80 acres in the Hudson Valley — the kind of place where the architecture does the decorating for you.',
      600000, 'Hudson Valley, NY', 90,
      'Renovated barn + ceremony field + 6 on-site cabins. Hosts 50-200 guests. In-house bar, planning, and design team.',
      'approved', true,
      '{"reception_starting_cents":600000,"ceremony_starting_cents":250000,"bar_services_per_person_cents":1500,"couples_typical_spend_cents":4500000,"max_guests":200,"min_guests":50,"settings":["Farm & Ranch","Garden","Trees","Mountain"],"amenities":["Ceremony Area","Reception Area","Indoor Event Space","Outdoor Event Space","Covered Outdoor Space","Dressing Room","Bridal Suite","On-Site Accommodations","Wireless Internet","Parking"],"ceremony_types":["Religious","Non-Religious","Interfaith","Vow Renewal"],"service_offerings":["Bar & Drinks","Catering","Wedding Design","Service Staff","Tents"]}'::jsonb
    ),
    (
      null, 'Aurora Lane Studios', 'Photographer',
      'Documentary-style wedding photography that prioritizes the in-between moments — the candid hug, the quiet exit, the second laugh.',
      350000, 'Brooklyn, NY', 200,
      'Editorial + documentary work for weddings, milestone events, and brand portraits. Bright, warm color palette. Two-shooter weekends standard.',
      'approved', true,
      '{"package_starting_cents":350000,"engagement_shoot_starting_cents":75000,"destination_weddings_welcome":true,"travel_fee_starts_at_miles":60,"default_coverage_hours":8,"second_shooter_available":true,"gallery_delivery_weeks":6,"styles":["Documentary","Editorial","Bright & Airy","Modern"],"service_offerings":["Engagement shoot","Bridal portraits","Day-after session","Drone aerial"],"deliverables":["Digital files (high-res)","Online gallery","Print release included","Albums available"]}'::jsonb
    ),
    (
      null, 'Reverie Films', 'Videographer',
      'Cinematic wedding films that play like a short documentary. Multi-camera, drone, the works.',
      500000, 'Austin, TX', 150,
      'Two-videographer crew with cinematic + storytelling style. Highlight reel + extended cut + ceremony cut delivered in 8 weeks.',
      'approved', true,
      '{"package_starting_cents":500000,"travel_fee_starts_at_miles":100,"default_coverage_hours":8,"max_videographers":2,"final_delivery_weeks":8,"styles":["Cinematic","Storytelling","Documentary"],"deliverables":["Highlight reel (3-5 min)","Extended highlight (8-15 min)","Full ceremony cut","Drone footage","Multi-camera"]}'::jsonb
    ),
    (
      null, 'The Sash House', 'Bridal Salon',
      'Designer bridal in a calm, appointment-only Manhattan atelier. Sample sizes 0-22 in stock; custom orders welcome.',
      220000, 'Manhattan, NY', 50,
      'Carrying Pronovias, Maggie Sottero, Allure Couture, and a curated collection of independent designers. On-site alterations team.',
      'approved', true,
      '{"dress_price_low_cents":220000,"dress_price_high_cents":1200000,"alterations_starting_cents":45000,"accepts_layaway":true,"silhouettes":["A-line","Ballgown","Mermaid","Sheath","Trumpet"],"necklines":["V-neck","Sweetheart","Off-shoulder","Strapless","High-neck"],"styles":["Modern","Romantic","Classic","Vintage"],"sizes_in_stock":["0-2","4-8","10-14","16-22"],"plus_size_specialist":false,"services":["Alterations on-site","Trunk shows hosted","Private appointments","Veils & accessories","Bridesmaid dresses"],"appointment_required":true,"walk_ins_welcome":false,"lead_time_weeks":24}'::jsonb
    ),

    -- ── 24 categories with basic fields only ─────────────────────────
    (null, 'Garden Table Catering', 'Catering',
     'Seasonal, hyper-local cooking for weddings + private dinners. Family-style or plated; full bar service available.',
     12500, 'Hudson Valley, NY', 100, 'Per-head pricing varies by menu. Specializes in farm-to-table multi-course dinners and elevated buffets.',
     'approved', true, '{}'::jsonb),

    (null, 'Kindred Sound', 'DJ',
     'Wedding DJs with a curator''s ear — soul, R&B, house, the right edits at the right time.',
     220000, 'Charlotte, NC', 150, '4-hour reception standard. MC services + uplighting + live remixing.',
     'approved', true, '{}'::jsonb),

    (null, 'The Sundowners', 'Band',
     '6-piece live band — horn section, female + male lead vocals, and a setlist that crosses Motown, soul, disco, and modern pop.',
     650000, 'Nashville, TN', 200, 'Includes ceremony acoustic set, cocktail hour trio, and full reception. PA + lighting included.',
     'approved', true, '{}'::jsonb),

    (null, 'Magnolia Strings', 'Ensemble',
     'Classical string quartet — ceremony processionals, cocktail hour, and dinner sets. Modern arrangements alongside traditional.',
     180000, 'Charleston, SC', 120, 'Quartet, trio, or duo configurations. Sheet music for custom requests with 4 weeks'' notice.',
     'approved', true, '{}'::jsonb),

    (null, 'Bloom & Bough', 'Florist',
     'Garden-style installations and seasonal florals — never overworked, always with a sense of the season.',
     180000, 'Asheville, NC', 100, 'Locally-sourced where possible. Sculptural ceremony arches, loose centerpieces, full reception design.',
     'approved', true, '{}'::jsonb),

    (null, 'North Field Events', 'Event Planner',
     'Full-service planning for weddings of 80-300 guests. Ten years on the Hudson Valley vendor circuit; we know who shows up and who doesn''t.',
     800000, 'Hudson Valley, NY', 150, 'Full planning, partial planning, and month-of coordination tiers.',
     'approved', true, '{}'::jsonb),

    (null, 'Set Design Co.', 'Decorator',
     'Tablescape design, lighting, signage, and full event styling — beyond what florists do.',
     250000, 'Brooklyn, NY', 80, 'Editorial-grade decor specs delivered + executed. Coordinates with florist + planner.',
     'approved', true, '{}'::jsonb),

    (null, 'Gilded Beauty', 'Makeup Artist',
     'On-location bridal makeup with an editorial finish. Teams of 2-4 stylists for full bridal parties.',
     65000, 'Los Angeles, CA', 60, 'Trial sessions included. Touch-up kits provided. Specialty: soft glam + editorial bridal.',
     'approved', true, '{}'::jsonb),

    (null, 'Veil Beauty Lab', 'Beauty',
     'Hair, makeup, lashes, brows, skin prep — a full bridal beauty team that handles the whole weekend.',
     95000, 'Chicago, IL', 75, 'On-location for getting-ready, with options for engagement-shoot prep and rehearsal-dinner styling.',
     'approved', true, '{}'::jsonb),

    (null, 'Levain & Co. Patisserie', 'Baker',
     'Sculptural wedding cakes, French pastry dessert tables, and small-batch favors.',
     45000, 'Brooklyn, NY', 60, 'Custom flavor profiles, seasonal fillings, multiple tier sizes. Nut-free and gluten-free options.',
     'approved', true, '{}'::jsonb),

    (null, 'Last Call Bar Co.', 'Bartender',
     'Mobile bar service — licensed, insured bartenders + cocktail menu development for private events.',
     8500, 'Austin, TX', 100, 'Hourly per bartender, with a 4-hour minimum. Custom cocktail menu development included.',
     'approved', true, '{}'::jsonb),

    (null, 'Set the Table Hospitality', 'Waitstaff',
     'Trained service staff for plated dinners and passed-canape receptions. Black-tie or modern casual.',
     7500, 'Brooklyn, NY', 80, 'Hourly per server. 4-hour minimum. Tip pooling handled in advance, no surprise gratuity for guests.',
     'approved', true, '{}'::jsonb),

    (null, 'Guardline Event Security', 'Security',
     'Licensed and insured event security — access control, crowd management, VIP protection.',
     8500, 'Charlotte, NC', 150, 'Plainclothes or uniformed. 6-hour minimum. Background-checked staff, fully insured.',
     'approved', true, '{}'::jsonb),

    (null, 'Premier Valet Group', 'Valet',
     'Insured valet teams for venues without on-site parking. White-glove service for private homes too.',
     7000, 'Atlanta, GA', 100, 'Hourly per valet attendant. Includes valet podium, key boxes, and shuttle coordination.',
     'approved', true, '{}'::jsonb),

    (null, 'On the Day Coordination', 'Day-of Coordinator',
     'Take-the-baton coordination for couples who''ve planned the wedding themselves but want a pro running the day.',
     250000, 'Asheville, NC', 100, 'Picks up 6 weeks out. Vendor confirmation, run-of-show, day-of management.',
     'approved', true, '{}'::jsonb),

    (null, 'Two-Step Dance Lessons', 'Dance Instructor',
     'First-dance choreography + private + group lessons for wedding parties. Swing, salsa, foxtrot, country, ballroom.',
     12000, 'Nashville, TN', 30, '4-8 lessons typical for first dance. Includes choreography to your chosen song.',
     'approved', true, '{}'::jsonb),

    (null, 'Welcome Bag Studio', 'Favors & Gifts',
     'Curated welcome-bag and bridal-party gift programs. Sourced, branded, assembled, delivered to the venue.',
     35, 'Brooklyn, NY', 50, 'Per-bag pricing scales with quantity. Includes curation, custom tags, assembly, and venue delivery.',
     'approved', true, '{}'::jsonb),

    (null, 'Letterpress + Lavender', 'Invitation Designer',
     'Custom invitation suites, save-the-dates, and full day-of paper programs. Letterpress and digital options.',
     180000, 'Portland, OR', 0, 'Ships nationally. Suite typically includes save-the-date, invitation, RSVP, details card, envelopes.',
     'approved', true, '{}'::jsonb),

    (null, 'Atelier Vela Fine Jewelry', 'Jeweler',
     'Independent jeweler — bench-made wedding bands, ethical-sourced engagement rings, custom commissions.',
     280000, 'Manhattan, NY', 0, 'In-person consults available. Custom design 8-12 weeks. Lifetime warranty on bench work.',
     'approved', true, '{}'::jsonb),

    (null, 'Vows by Olivia', 'Officiant',
     'Co-write a fully custom ceremony — secular, interfaith, traditional, or whatever your story calls for.',
     85000, 'Hudson Valley, NY', 200, 'Includes 2-3 planning calls, custom ceremony script, marriage license filing.',
     'approved', true, '{}'::jsonb),

    (null, 'Snapshot Social Booths', 'Photo Booth',
     'Open-air photo booths and mirror booths. Custom backdrops, instant prints, branded GIFs, full digital gallery.',
     95000, 'Los Angeles, CA', 75, '3-hour minimum, attendant included. Props, backdrop, custom print template.',
     'approved', true, '{}'::jsonb),

    (null, 'Tent & Table Rental Co.', 'Rentals',
     'Tents, tables, chairs, linens, dance floors, lighting, and event-day infrastructure.',
     500, 'Charlotte, NC', 200, 'Delivery, setup, and teardown included. Coordinates with your planner on delivery windows.',
     'approved', true, '{}'::jsonb),

    (null, 'Heritage Limousine Service', 'Transportation',
     'Vintage cars for the getaway, limos for the wedding party, and shuttle coordination for guests.',
     35000, 'Charlotte, NC', 100, 'Hourly per vehicle. 3-hour minimum. Includes professional chauffeurs.',
     'approved', true, '{}'::jsonb),

    (null, 'Honeymoon Compass Travel', 'Travel Specialist',
     'Honeymoon planning + destination-wedding logistics. Group bookings, villa coordination, the full travel layer.',
     0, 'Asheville, NC', 0, 'No fee for honeymoon planning (commissions paid by hotels). Destination wedding logistics quoted per event.',
     'approved', true, '{}'::jsonb);
end $$;
