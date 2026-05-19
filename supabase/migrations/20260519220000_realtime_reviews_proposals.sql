-- Enable realtime for reviews + proposals so the in-thread rating
-- surfaces refresh live. Without this the postgres_changes channel
-- never sees these tables and the RatingPromptStrip /
-- SubmittedReviewStatusCard would still need a manual reload to pick
-- up the other party's actions.
--
-- direct_messages is already in the publication (set up earlier for
-- the chat live updates).

alter publication supabase_realtime add table public.reviews;
alter publication supabase_realtime add table public.proposals;
