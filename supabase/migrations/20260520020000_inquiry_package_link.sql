-- Per-package event reviews. Today inquiries only know which vendor
-- (Chris Cakes) the host contacted; reviews aggregate at the vendor
-- level. With multi-package vendors that's a lie — a 5★ on "Plated
-- dinner" also boosts the "Buffet" average. Fix is to record which
-- package the inquiry is actually about, so reviews can attribute.
--
--   • Nullable FK so existing inquiries (no package context) keep
--     working. We don't backfill.
--   • ON DELETE SET NULL so a vendor pruning an old package doesn't
--     cascade-delete the inquiry history.
--   • Public view aggregates released event reviews per package
--     for display on the vendor detail page. Security invoker so
--     RLS on reviews still gates row visibility — anonymous viewers
--     see only released-or-14d-old reviews, same as the public read
--     policy already enforces.

alter table public.inquiries
  add column if not exists package_id uuid
    references public.vendor_packages(id) on delete set null;

create index if not exists inquiries_package_id_idx
  on public.inquiries(package_id)
  where package_id is not null;

drop view if exists public.package_rating_summary;
create view public.package_rating_summary
with (security_invoker = on)
as
select i.package_id,
       avg(r.rating)::numeric(3, 2) as avg_rating,
       count(*)::int as review_count
from public.reviews r
join public.inquiries i on i.id = r.inquiry_id
where r.kind = 'event'
  and r.hidden_at is null
  and i.package_id is not null
  and (
    r.released_at is not null
    or r.created_at < (now() - interval '14 days')
  )
group by i.package_id;

grant select on public.package_rating_summary to anon, authenticated;
