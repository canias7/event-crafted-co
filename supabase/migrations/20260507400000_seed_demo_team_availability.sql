-- Seed demo team_bios + availability rules so the new "Team" and
-- "Availability" sections on the public vendor profile actually
-- render for the 31 demos seeded in 20260507200000_reseed_demos.sql.
--
-- Without these rows, both VendorTeamPublic and
-- VendorAvailabilityPublic short-circuit to null (they're designed
-- to hide cleanly when the vendor hasn't filled them in), which
-- left every demo profile missing those two sections.
--
-- Idempotent: each block joins by business_name on is_demo rows,
-- so re-running after the reseed is a no-op once the rows exist.
-- The first re-run guards against duplicates with NOT EXISTS.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Team bios — one owner per demo, plus a second member for the
--    handful of vendors that typically run with a small team.
-- ─────────────────────────────────────────────────────────────────────
insert into public.vendor_team_bios (
  vendor_id, display_name, role, bio, is_owner, display_order
)
select vp.id, t.display_name, t.role, t.bio, t.is_owner, t.display_order
from (values
  -- Venues
  ('The Hayloft at Crooked Creek', 'Eliza Crooke', 'Owner & Lead Curator',
   'Third-generation farmer turned venue host. On-site for every wedding — answers logistics questions in real time and makes sure the day actually feels effortless.',
   true, 0),
  ('Wildhaven Field & Orchard', 'Jenny Hernandez', 'Owner',
   'Took over the orchard in 2018 and opened it for events two years later. Splits her time between event hosting and the cider business.',
   true, 0),
  ('Theodora Private Dining Room', 'Marcel Beaumont', 'Owner & General Manager',
   'Ran the floor at two Michelin-starred Manhattan restaurants before opening Theodora. Hands-on for every booking.',
   true, 0),
  ('The Ledger Conference Hall', 'Priya Ramaswamy', 'Director of Events',
   'Built the events program from scratch. Specializes in tech offsites, executive summits, and conferences with hybrid AV needs.',
   true, 0),
  -- Food & Beverage
  ('Garden Table Catering', 'Sam Collier', 'Executive Chef & Owner',
   'Trained in farm-to-table kitchens in Vermont and the Hudson Valley. Builds menus around what''s in season the week of your event.',
   true, 0),
  ('Garden Table Catering', 'Wes Brand', 'Sous Chef',
   'Long-time sous + tasting-menu lead. Runs all day-of kitchen logistics on Sam''s team.',
   false, 1),
  ('Last Call Bar Co.', 'Devon Marks', 'Founder',
   'Bartender by trade — built Last Call after 8 years behind the stick at Austin cocktail bars. Designs every event menu personally.',
   true, 0),
  ('Levain & Co. Patisserie', 'Anika Cho', 'Owner & Head Pastry Chef',
   'CIA-trained, formerly pastry chef at a Brooklyn fine-dining restaurant. Specializes in sculptural cakes and seasonal flavor.',
   true, 0),
  ('Smoke Stack BBQ Truck', 'Bobby McLeod', 'Pitmaster & Owner',
   '20-year competition pitmaster, runs the truck and the smokers personally. Brisket-first philosophy.',
   true, 0),
  -- Entertainment
  ('Kindred Sound', 'Marcus Hayes', 'Owner & Lead DJ',
   '15 years of weddings and private events. Soul + R&B is the foundation; reads the room and goes wherever the dance floor takes him.',
   true, 0),
  ('The Sundowners', 'Gabe Ortiz', 'Bandleader',
   'Trumpet, sax, and bandleader for the past decade. Builds the setlist + run-of-show with every couple.',
   true, 0),
  ('The Sundowners', 'Ana Perez', 'Lead Vocals',
   'Lead singer + frontwoman. Soul, Motown, and contemporary pop — does ceremony processionals on request.',
   false, 1),
  ('Lumen Aerial Arts', 'Talia Ng', 'Founder & Lead Aerialist',
   'Cirque-trained aerialist. Choreographs every performance to the room and lighting before show day.',
   true, 0),
  ('Olivia Reyes Hosting', 'Olivia Reyes', 'Owner & Emcee',
   'Bilingual host with TV news + auction-floor experience. Calm under live-time pressure, never over-talks.',
   true, 0),
  -- Media
  ('Aurora Lane Studios', 'Aurora Lane', 'Founder & Lead Photographer',
   '10 years documenting weddings — favors candid moments over posed setups. Believes the best photos happen when no one is looking.',
   true, 0),
  ('Aurora Lane Studios', 'Maya Patel', 'Senior Associate Photographer',
   'Editorial-trained, second shooter on every full-day wedding. Specializes in available-light portraits and reception coverage.',
   false, 1),
  ('Reverie Films', 'Eli Tran', 'Founder & Director',
   'Documentary filmmaker before pivoting to weddings. Cinematic without being cheesy — every film tells a real story.',
   true, 0),
  ('Reverie Films', 'Sophia Quintero', 'Cinematographer',
   'Second cinematographer + colorist. Handles ceremony multi-cam, reception, and the entire post-production pass.',
   false, 1),
  ('Snapshot Social Booths', 'Kendra Vasquez', 'Owner',
   'Built Snapshot from a single open-air booth in 2019. On-site attendant for every wedding — booths are her baby.',
   true, 0),
  -- Design & Decor
  ('North Field Events', 'Charlotte Wynn', 'Founder & Lead Planner',
   'Planner with 12 years coordinating 80-300 guest weddings. Hands-on through the day-of, never delegates the run-of-show.',
   true, 0),
  ('North Field Events', 'Rachel Burnett', 'Day-of Coordinator',
   'Day-of lead for partial-planning and month-of clients. Keeps the timeline running and the vendors aligned.',
   false, 1),
  ('Bloom & Bough', 'Hazel Park', 'Owner & Lead Designer',
   'Trained in Tokyo and London before opening Bloom & Bough. Garden-style installations, sculptural arches, and sustainable sourcing.',
   true, 0),
  ('Bloom & Bough', 'Sam Rivera', 'Lead Floral Designer',
   'Co-leads installations with Hazel; runs the studio and personal-flowers line on production days.',
   false, 1),
  ('Veil Beauty Lab', 'Naomi Aldrin', 'Founder',
   'Bridal makeup artist with 15 years on-location. Trained the rest of the team to her exact look — every artist delivers the same finish.',
   true, 0),
  ('Set Design Co.', 'Theo Marquez', 'Creative Director & Owner',
   'Set designer for editorial and event shoots. Builds bespoke pieces in the studio, executes installs on-site.',
   true, 0),
  ('Sharp & Co. Grooming', 'Marco Russo', 'Master Barber & Owner',
   'Third-generation barber. Hot-towel shaves and event-day grooming for grooms, groomsmen, and corporate VIP groups.',
   true, 0),
  -- Rentals
  ('Bloom Hill Rentals', 'Wes Lakeman', 'Owner',
   'Started Bloom Hill collecting farmhouse furniture for a single wedding. Now stocks 1,200+ pieces and delivers across the metro.',
   true, 0),
  ('Sailcloth Co.', 'Hugh Ashford', 'Founder',
   'Tent installer with 20 years of large-format experience — engineers every install personally.',
   true, 0),
  ('Ember & Pulse AV', 'Devon Park', 'Owner & AV Director',
   'Touring lighting designer turned event-AV builder. Treats every wedding like a show production.',
   true, 0),
  ('Stage Hands Co.', 'Mara Klein', 'Owner',
   'Production manager from theater/dance. Builds custom dance floors + modular staging for events.',
   true, 0),
  ('Heritage Limousine Service', 'Ray Carrington', 'Owner',
   'Family-owned for two generations. Personally maintains the vintage fleet and trains every chauffeur.',
   true, 0),
  -- Experiences
  ('The Cellar Sommelier Co.', 'Inés Vega', 'Sommelier & Owner',
   'Court of Master Sommeliers Level 3. Builds tasting flights tailored to event tone and guest palate.',
   true, 0),
  ('The Cellar Sommelier Co.', 'Lucas Wright', 'Sommelier',
   'Beverage director at a NoVa wine bar before joining The Cellar. Whiskey + spirits specialist.',
   false, 1),
  ('Smoke + Spirits Cigar Service', 'Diego Castillo', 'Founder',
   'Master roller — trained in the Dominican Republic. Roams receptions hand-rolling Robustos to order.',
   true, 0),
  -- Corporate Services
  ('Set the Table Hospitality', 'Joelle Park', 'Owner',
   'Built her staff team after 10 years on plated-service floors at Manhattan caterers. Trains every server personally.',
   true, 0),
  ('Voicewise Speakers Bureau', 'Phoebe Nakata', 'Founder',
   'Former exec at a Big Five conference series. Curates speaker matches based on audience and outcome, not brand-name pull.',
   true, 0),
  ('Voicewise Speakers Bureau', 'Marcus Diallo', 'Talent Director',
   'Manages the speaker roster + content prep. Sits in on every prep call to coach the on-stage flow.',
   false, 1),
  ('Guardline Event Security', 'Daniel Reeves', 'Owner & Director',
   '20 years in licensed event security across the Carolinas. On-site for every VIP / large-crowd event.',
   true, 0),
  ('Premier Valet Group', 'Anthony Cole', 'Founder',
   'Valet supervisor for 12 years before opening Premier in 2016. Personally schedules attendant teams for every event.',
   true, 0)
) as t(business_name, display_name, role, bio, is_owner, display_order)
join public.vendor_profiles vp on vp.business_name = t.business_name and vp.is_demo
where not exists (
  select 1 from public.vendor_team_bios existing
  where existing.vendor_id = vp.id and existing.display_name = t.display_name
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Availability rules — every demo closed Sunday (0) + Monday (1).
--    Standard service-business pattern; gives the public Availability
--    calendar enough data to show the Turo/Airbnb-style strikethrough
--    pattern across both visible months.
-- ─────────────────────────────────────────────────────────────────────
insert into public.vendor_availability_rules (
  vendor_id, day_of_week, is_unavailable
)
select vp.id, days.dow, true
from public.vendor_profiles vp
cross join (values (0), (1)) as days(dow)
where vp.is_demo
  and not exists (
    select 1 from public.vendor_availability_rules existing
    where existing.vendor_id = vp.id and existing.day_of_week = days.dow
  );
