-- Belt-and-suspenders for the signup trial grant. The trigger only
-- fires on profiles INSERT, so in normal operation the 100 credits
-- land exactly once per user. But edge cases (admin profile delete+
-- recreate, future migrations, manual ledger seeding) could trigger
-- a re-fire. Reject the second grant inline so even pathological
-- paths can't ever double-pay the trial.
--
-- Implementation: before performing grant_credits, check whether the
-- user already has *any* trial_grant ledger row. If yes, skip
-- silently (and log) instead of inserting a duplicate.

create or replace function public.tg_grant_signup_trial_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already integer;
begin
  if new.role <> 'vendor' then
    return new;
  end if;

  -- One-shot guard: if the user already received any trial_grant,
  -- don't grant again.
  select count(*) into v_already
    from public.vendor_credit_transactions
   where user_id = new.id and kind = 'trial_grant';
  if v_already > 0 then
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
  exception when others then
    raise warning 'tg_grant_signup_trial_credits failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
