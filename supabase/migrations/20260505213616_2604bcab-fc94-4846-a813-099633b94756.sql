alter table public.vendor_profiles
  alter column user_id drop not null;

alter table public.vendor_profiles
  add column if not exists is_demo boolean not null default false,
  add column if not exists application_status text not null default 'approved',
  add column if not exists category_attributes jsonb not null default '{}'::jsonb;

create index if not exists vendor_profiles_demo_idx
  on public.vendor_profiles (is_demo)
  where is_demo = true;

do $$
begin
  if exists (select 1 from public.vendor_profiles where is_demo) then
    return;
  end if;

  insert into public.vendor_profiles (
    user_id, business_name, category, bio, base_price_cents,
    location, service_radius_miles, portfolio_summary, verified_at,
    application_status, is_demo, category_attributes
  ) values
    (null, 'The Hayloft at Crooked Creek', 'Venue',
     'A restored 1890s dairy barn on 80 acres in the Hudson Valley — the kind of place where the architecture does the decorating for you.',
     600000, 'Hudson Valley, NY', 90,
     'Renovated barn + ceremony field + 6 on-site cabins. Hosts 50-200 guests. In-house bar, planning, and design team.',
     now(), 'approved', true,
     '{"reception_starting_cents":600000,"ceremony_starting_cents":250000,"max_guests":200,"min_guests":50}'::jsonb),
    (null, 'Aurora Lane Studios', 'Photographer',
     'Documentary-style wedding photography that prioritizes the in-between moments — the candid hug, the quiet exit, the second laugh.',
     350000, 'Brooklyn, NY', 200,
     'Editorial + documentary work for weddings. Two-shooter weekends standard.',
     now(), 'approved', true,
     '{"package_starting_cents":350000,"default_coverage_hours":8}'::jsonb),
    (null, 'Reverie Films', 'Videographer',
     'Cinematic wedding films that play like a short documentary. Multi-camera, drone, the works.',
     500000, 'Austin, TX', 150,
     'Two-videographer crew. Highlight reel + extended cut delivered in 8 weeks.',
     now(), 'approved', true, '{}'::jsonb),
    (null, 'The Sash House', 'Bridal Salon',
     'Designer bridal in a calm, appointment-only Manhattan atelier.',
     220000, 'Manhattan, NY', 50,
     'Carrying Pronovias, Maggie Sottero, Allure Couture. On-site alterations.',
     now(), 'approved', true, '{}'::jsonb),
    (null, 'Garden Table Catering', 'Catering', 'Seasonal, hyper-local cooking for weddings + private dinners.', 12500, 'Hudson Valley, NY', 100, 'Per-head pricing varies. Farm-to-table multi-course dinners and elevated buffets.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Kindred Sound', 'DJ', 'Wedding DJs with a curator''s ear — soul, R&B, house.', 220000, 'Charlotte, NC', 150, '4-hour reception standard. MC services + uplighting.', now(), 'approved', true, '{}'::jsonb),
    (null, 'The Sundowners', 'Band', '6-piece live band with horn section and male/female leads.', 650000, 'Nashville, TN', 200, 'Ceremony acoustic, cocktail trio, full reception. PA + lighting included.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Magnolia Strings', 'Ensemble', 'Classical string quartet for ceremonies and cocktail hour.', 180000, 'Charleston, SC', 120, 'Quartet, trio, or duo. Custom arrangements with notice.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Bloom & Bough', 'Florist', 'Garden-style installations and seasonal florals.', 180000, 'Asheville, NC', 100, 'Locally-sourced. Sculptural arches, loose centerpieces, full design.', now(), 'approved', true, '{}'::jsonb),
    (null, 'North Field Events', 'Event Planner', 'Full-service planning for weddings of 80-300 guests.', 800000, 'Hudson Valley, NY', 150, 'Full, partial, and month-of coordination tiers.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Set Design Co.', 'Decorator', 'Tablescape, lighting, signage, and full event styling.', 250000, 'Brooklyn, NY', 80, 'Editorial-grade decor specs delivered + executed.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Gilded Beauty', 'Makeup Artist', 'On-location bridal makeup with editorial finish.', 65000, 'Los Angeles, CA', 60, 'Trial sessions included. Soft glam + editorial bridal.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Veil Beauty Lab', 'Beauty', 'Hair, makeup, lashes, brows, skin prep — full bridal beauty team.', 95000, 'Chicago, IL', 75, 'On-location for getting-ready. Engagement-shoot prep available.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Levain & Co. Patisserie', 'Baker', 'Sculptural wedding cakes and French pastry dessert tables.', 45000, 'Brooklyn, NY', 60, 'Custom flavors, seasonal fillings. Nut-free and gluten-free options.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Last Call Bar Co.', 'Bartender', 'Mobile bar service — licensed, insured bartenders.', 8500, 'Austin, TX', 100, 'Hourly per bartender, 4-hour minimum. Custom cocktail menus.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Set the Table Hospitality', 'Waitstaff', 'Trained service staff for plated dinners and receptions.', 7500, 'Brooklyn, NY', 80, 'Hourly per server. 4-hour minimum.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Guardline Event Security', 'Security', 'Licensed event security — access control, crowd management.', 8500, 'Charlotte, NC', 150, 'Plainclothes or uniformed. 6-hour minimum.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Premier Valet Group', 'Valet', 'Insured valet teams for venues without on-site parking.', 7000, 'Atlanta, GA', 100, 'Hourly per attendant. Includes podium, key boxes, shuttle coord.', now(), 'approved', true, '{}'::jsonb),
    (null, 'On the Day Coordination', 'Day-of Coordinator', 'Take-the-baton coordination for self-planning couples.', 250000, 'Asheville, NC', 100, 'Picks up 6 weeks out. Vendor confirmation, run-of-show.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Two-Step Dance Lessons', 'Dance Instructor', 'First-dance choreography + private + group lessons.', 12000, 'Nashville, TN', 30, '4-8 lessons typical. Includes choreography to your song.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Welcome Bag Studio', 'Favors & Gifts', 'Curated welcome-bag and bridal-party gift programs.', 35, 'Brooklyn, NY', 50, 'Per-bag pricing scales with quantity. Curation, tags, assembly, delivery.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Letterpress + Lavender', 'Invitation Designer', 'Custom invitation suites, save-the-dates, day-of paper.', 180000, 'Portland, OR', 0, 'Ships nationally. Save-the-date, invite, RSVP, details.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Atelier Vela Fine Jewelry', 'Jeweler', 'Independent jeweler — bench-made bands, ethical-sourced rings.', 280000, 'Manhattan, NY', 0, 'In-person consults. Custom design 8-12 weeks. Lifetime warranty.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Vows by Olivia', 'Officiant', 'Co-write a fully custom ceremony — secular, interfaith, traditional.', 85000, 'Hudson Valley, NY', 200, '2-3 planning calls, custom script, marriage license filing.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Snapshot Social Booths', 'Photo Booth', 'Open-air and mirror photo booths with custom backdrops.', 95000, 'Los Angeles, CA', 75, '3-hour minimum, attendant included.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Tent & Table Rental Co.', 'Rentals', 'Tents, tables, chairs, linens, dance floors, lighting.', 500, 'Charlotte, NC', 200, 'Delivery, setup, and teardown included.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Heritage Limousine Service', 'Transportation', 'Vintage cars, limos, and shuttle coordination.', 35000, 'Charlotte, NC', 100, 'Hourly per vehicle. 3-hour minimum. Professional chauffeurs.', now(), 'approved', true, '{}'::jsonb),
    (null, 'Honeymoon Compass Travel', 'Travel Specialist', 'Honeymoon planning + destination-wedding logistics.', 0, 'Asheville, NC', 0, 'No fee for honeymoon planning. Destination wedding logistics quoted per event.', now(), 'approved', true, '{}'::jsonb);
end $$;