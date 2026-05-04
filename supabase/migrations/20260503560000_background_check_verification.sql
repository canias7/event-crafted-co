-- Background check as a fourth verification kind alongside identity,
-- insurance, and business_license. Vendors who work in-home (or at
-- private homes — photographers, planners, makeup artists going to a
-- bride's prep, in-home chefs) get a meaningful trust differentiator
-- by uploading a Checkr / Sterling / similar report PDF.
--
-- For now the flow is upload-then-admin-review (same as the other
-- kinds). A direct Checkr API integration is post-launch — that
-- requires a signed agreement with Checkr and a webhook to
-- accept the result programmatically.

alter table public.vendor_verifications
  drop constraint if exists vendor_verifications_kind_check;

alter table public.vendor_verifications
  add constraint vendor_verifications_kind_check
  check (kind in ('identity', 'insurance', 'business_license', 'background_check'));
