-- Granular notification preferences as a single jsonb column on
-- profiles. Default to "all on" so existing users keep getting the
-- emails they already get; opt-out is per-kind.
--
-- Shape:
--   {
--     "new_inquiry": true,           // host: vendor responded to your inquiry
--     "proposal_viewed": true,       // vendor: host opened your proposal
--     "proposal_accepted": true,     // vendor: host accepted your proposal
--     "review_received": true,       // vendor: a host left you a review
--     "weekly_digest": true,         // vendor: weekly performance summary
--     "daily_digest": true,          // shared: roundup of activity
--     "marketing": false             // shared: product news / tips (opt-in)
--   }
--
-- Background scanners read this column and skip users who've opted
-- out of the relevant kind. The web UI updates it via plain
-- profile updates (RLS already restricts to owner).

alter table public.profiles
  add column if not exists notification_prefs jsonb not null
  default '{"new_inquiry":true,"proposal_viewed":true,"proposal_accepted":true,"review_received":true,"weekly_digest":true,"daily_digest":true,"marketing":false}'::jsonb;
