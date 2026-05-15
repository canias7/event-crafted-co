-- editorial_articles writer (VendorBlogPage) was unreachable from any
-- sidebar/palette and had 0 rows; reader (EditorialArticlePage at
-- /guides/:slug) had no remaining surface either. Mobile vendor has
-- no blog feature. Drop the table.
drop table if exists public.editorial_articles cascade;
