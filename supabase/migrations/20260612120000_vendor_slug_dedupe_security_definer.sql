-- Fix: new-listing submits failing with `duplicate key value violates
-- unique constraint "vendor_profiles_slug_key"`.
--
-- tg_set_vendor_slug dedupes by checking
--   exists(select 1 from vendor_profiles where slug = candidate)
-- but the function was NOT security definer, so that SELECT ran under
-- the inserting vendor's RLS. The read policies only expose approved
-- rows + the caller's own rows — meaning the dedupe check was blind to
-- every other user's draft/pending/rejected listing. Once any
-- non-approved row held a slug, the next vendor whose name slugged to
-- the same base picked the identical candidate and the unique index
-- rejected the INSERT with the duplicate-key error users saw.
--
-- (This bit hard in production because the listing wizards didn't set
-- business_name on insert, so every row slugged to the shared fallback
-- base "vendor" — the first submit took it, all later submits from
-- other accounts collided. The wizards now pass business_name, but the
-- dedupe must still see ALL rows for same-named vendors.)
--
-- SECURITY DEFINER makes the exists() run as the function owner
-- (bypasses RLS), matching enforce_listing_min_photos which already
-- works this way. search_path stays pinned; the function only reads
-- slugs and writes new.slug, so there's nothing to leak.

create or replace function public.tg_set_vendor_slug()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_base text;
  v_candidate text;
  v_n int;
begin
  if new.slug is not null and new.slug <> '' then return new; end if;
  v_base := public.slugify_vendor_name(new.business_name);
  if v_base = '' then v_base := 'vendor'; end if;

  -- Serialize concurrent inserts racing on the same base slug (see
  -- 20260517110000). hashtextextended → bigint accepted by
  -- pg_advisory_xact_lock(bigint).
  perform pg_advisory_xact_lock(
    hashtextextended('vendor_slug:' || v_base, 0)
  );

  v_candidate := v_base;
  v_n := 1;
  while exists (select 1 from public.vendor_profiles where slug = v_candidate) loop
    v_n := v_n + 1;
    if v_n > 5 then
      v_candidate := v_base || '-' || substring(new.id::text, 1, 6);
      exit;
    end if;
    v_candidate := v_base || '-' || v_n::text;
  end loop;

  new.slug := v_candidate;
  return new;
end
$function$;
