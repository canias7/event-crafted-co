-- OnboardingTour.tsx (the only consumer) was deleted in the
-- post-mirror cleanup. No DB function or trigger reads this column
-- either. Drop it.
alter table public.profiles drop column if exists tour_dismissed_at;
