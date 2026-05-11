-- reviews_public is a thin "is_hidden = false" view over reviews. By
-- default a Postgres view runs as its owner (postgres → bypasses RLS),
-- which is exactly what the Supabase advisor flags as
-- security_definer_view. The underlying reviews table already has a
-- public read policy that filters out hidden_at IS NOT NULL for
-- non-owners, so flipping the view to security_invoker = true is safe:
-- normal users keep seeing the same rows, but the query now respects
-- their auth context instead of running as superuser.

alter view public.reviews_public set (security_invoker = true);
