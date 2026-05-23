-- Audit fix #8. The current trial-grant guard checks
-- vendor_credit_transactions for an existing trial_grant row, but
-- that table cascade-deletes when auth.users (and the profile) gets
-- deleted. So: admin deletes a vendor → signup-trial row deletes
-- with them → same user signs up again with the same email → gets a
-- fresh 100 trial credits. Repeatable abuse path.
--
-- Fix: separate table keyed on lower(email), never cascade-deletes.
-- Trigger checks this table first; only grants on a row that
-- doesn't already exist.

create table if not exists public.signup_trials (
  email_lower text primary key,
  first_user_id uuid,
  first_granted_at timestamptz not null default now()
);

alter table public.signup_trials enable row level security;

-- No public access. Only the trigger (via service_role / definer)
-- writes here; admins can read it via the admin RPC layer.
drop policy if exists signup_trials_admin_read on public.signup_trials;
create policy signup_trials_admin_read
  on public.signup_trials
  for select
  to authenticated
  using (public.is_admin());

-- Backfill from existing trial_grant rows so current vendors don't
-- accidentally get a second trial if a future migration re-fires
-- the trigger. Email pulled from auth.users; lower-cased for
-- consistent matching.
insert into public.signup_trials (email_lower, first_user_id, first_granted_at)
select
  lower(u.email),
  t.user_id,
  min(t.created_at) as first_granted_at
from public.vendor_credit_transactions t
join auth.users u on u.id = t.user_id
where t.kind = 'trial_grant'
  and u.email is not null
group by lower(u.email), t.user_id
on conflict (email_lower) do nothing;

-- New trigger: guard on signup_trials, write to it on first grant,
-- only then call grant_credits.

create or replace function public.tg_grant_signup_trial_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_already_email integer;
  v_already_user integer;
begin
  if new.role <> 'vendor' then
    return new;
  end if;

  -- Two-layer guard:
  --   1. signup_trials by lower(email) — survives auth.users delete,
  --      so the same email can't double-claim.
  --   2. vendor_credit_transactions by user_id — defends against the
  --      trigger firing twice for the same user (shouldn't happen,
  --      profiles is one-row-per-user, but belt + suspenders).

  select lower(email) into v_email from auth.users where id = new.id;
  if v_email is not null then
    select count(*) into v_already_email
      from public.signup_trials where email_lower = v_email;
    if v_already_email > 0 then
      raise notice 'signup trial already claimed for email %, skipping', v_email;
      return new;
    end if;
  end if;

  select count(*) into v_already_user
    from public.vendor_credit_transactions
   where user_id = new.id and kind = 'trial_grant';
  if v_already_user > 0 then
    raise notice 'signup trial already granted for %, skipping', new.id;
    return new;
  end if;

  begin
    perform public.grant_credits(
      new.id,
      100,
      'trial_grant',
      null,
      null,
      'signup trial'
    );
    if v_email is not null then
      insert into public.signup_trials (email_lower, first_user_id)
        values (v_email, new.id)
        on conflict (email_lower) do nothing;
    end if;
  exception when others then
    raise warning 'tg_grant_signup_trial_credits failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
