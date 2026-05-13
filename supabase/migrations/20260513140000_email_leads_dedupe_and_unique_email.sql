-- Email-leads dedup. The chat-email-scraping function had been adding
-- the same business multiple times across runs because there was no
-- uniqueness on email. Result: 3 rows for infobiggscamera@gmail.com.
--
-- Step 1: keep the oldest row per normalized email, delete the rest.
-- Step 2: add a case-insensitive unique index so it can't happen again
-- regardless of which admin / source / casing was used.

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY lower(trim(email)) ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM public.email_leads
)
DELETE FROM public.email_leads
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS email_leads_email_unique
  ON public.email_leads (lower(trim(email)));
