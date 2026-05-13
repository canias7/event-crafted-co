-- Cold-outreach best practice: send from a real person, not noreply@.
-- Per-template From override lets us A/B different senders against
-- deliverability ("Chris from Vendora <chris@eventvendora.com>" vs
-- the default noreply@). NULL = fall back to EMAIL_FROM_ADDRESS env.
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS from_name TEXT,
  ADD COLUMN IF NOT EXISTS from_address TEXT;
