-- Postgres re-evaluates auth.uid() / auth.role() / auth.jwt() once per
-- row when those calls appear bare in an RLS expression. Wrapping the
-- call in (SELECT ...) coerces it into an InitPlan, so it runs once
-- per query instead of once per row. The advisor flags this as
-- "auth_rls_initplan"; this migration sweeps every policy in public.
--
-- The rewrite is purely a perf transformation — the truth value of
-- (SELECT auth.uid()) is identical to auth.uid() for any given query
-- on any given session. RLS semantics are unchanged.
--
-- Implementation: loop pg_policy, rewrite qual + with_check, ALTER
-- POLICY in place. We use a sentinel ~~AUTHWRAP_X~~ token to avoid
-- double-wrapping anything already written as (SELECT auth.X()).

do $$
declare
  rec record;
  new_qual text;
  new_wc text;
  stmt text;
begin
  for rec in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      p.polname as policy_name,
      pg_get_expr(p.polqual, p.polrelid) as qual_text,
      pg_get_expr(p.polwithcheck, p.polrelid) as wc_text
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    new_qual := rec.qual_text;
    new_wc   := rec.wc_text;

    if new_qual is not null then
      new_qual := regexp_replace(new_qual,
        '\(\s*SELECT\s+auth\.(uid|role|jwt|email)\(\s*\)\s*\)',
        '~~AUTHWRAP_\1~~', 'gi');
      new_qual := regexp_replace(new_qual,
        'auth\.(uid|role|jwt|email)\(\s*\)',
        '(SELECT auth.\1())', 'gi');
      new_qual := regexp_replace(new_qual,
        '~~AUTHWRAP_(uid|role|jwt|email)~~',
        '(SELECT auth.\1())', 'gi');
    end if;

    if new_wc is not null then
      new_wc := regexp_replace(new_wc,
        '\(\s*SELECT\s+auth\.(uid|role|jwt|email)\(\s*\)\s*\)',
        '~~AUTHWRAP_\1~~', 'gi');
      new_wc := regexp_replace(new_wc,
        'auth\.(uid|role|jwt|email)\(\s*\)',
        '(SELECT auth.\1())', 'gi');
      new_wc := regexp_replace(new_wc,
        '~~AUTHWRAP_(uid|role|jwt|email)~~',
        '(SELECT auth.\1())', 'gi');
    end if;

    if (new_qual is distinct from rec.qual_text)
       or (new_wc is distinct from rec.wc_text) then
      stmt := format('ALTER POLICY %I ON %I.%I',
                     rec.policy_name, rec.schema_name, rec.table_name);
      if new_qual is not null then
        stmt := stmt || format(' USING (%s)', new_qual);
      end if;
      if new_wc is not null then
        stmt := stmt || format(' WITH CHECK (%s)', new_wc);
      end if;
      raise notice 'Rewriting policy %.%.% -> %',
        rec.schema_name, rec.table_name, rec.policy_name, stmt;
      execute stmt;
    end if;
  end loop;
end $$;
