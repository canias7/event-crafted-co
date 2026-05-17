-- Serialize concurrent inserts that would race on the same base
-- slug. The slug trigger used to: (1) compute a candidate, (2) check
-- if any row already has it, (3) bump the suffix if so, (4) let the
-- INSERT proceed. With MVCC, two simultaneous transactions both see
-- step (2) return "no row" for the same candidate, both reach step
-- (4), and the UNIQUE INDEX vendor_profiles_slug_key catches the
-- loser with a confusing duplicate-key error.
--
-- Advisory xact lock scopes to (this transaction, this base slug):
-- two transactions trying to mint "chris-cakes" simultaneously now
-- serialize, the first commits its row, the second's exists() check
-- sees that row and correctly picks "chris-cakes-2". Lock releases
-- automatically at commit / rollback, no manual cleanup.

create or replace function public.tg_set_vendor_slug()
returns trigger
language plpgsql
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

  -- See header comment. hashtextextended → bigint accepted by
  -- pg_advisory_xact_lock(bigint). Namespace prefix avoids collision
  -- with any other code path that might lock on the same hash space.
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
