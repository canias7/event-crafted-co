-- Signup trial credits for new vendors.
--
-- When a new vendor account is created (handle_new_user inserts a
-- public.profiles row with role='vendor'), grant 100 trial credits
-- so the vendor can immediately test HILUX + Axion under the new
-- credit-metered flow. Trial value: 100 cr at $0.025 = $2.50 face;
-- cost-to-serve ~$0.80; effectively the customer-acquisition CAC.
--
-- 100 credits buys ~50 HILUX replies OR ~10 Axion images, enough
-- to feel HILUX in real conversation before deciding whether to
-- subscribe.
--
-- If the vendor never gets admin-approved they can't sign in (the
-- pending status gates that flow), so unused trial credits sit on
-- their row at no cost to us.
--
-- Trigger swallows credit-grant errors so a failure in the ledger
-- (DB down, bug) never blocks the signup itself.

create or replace function public.tg_grant_signup_trial_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'vendor' then
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
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_grant_signup_trial_credits on public.profiles;
create trigger profiles_grant_signup_trial_credits
  after insert on public.profiles
  for each row
  execute function public.tg_grant_signup_trial_credits();

-- Backfill: existing vendors created before this migration don't
-- have a credit balance row. Grant the same trial so the live
-- test accounts (and any pre-launch vendors) can use HILUX/Axion
-- immediately without waiting on Phase 3's Stripe-driven flow.
do $$
declare
  v_user_id uuid;
  v_count int := 0;
begin
  for v_user_id in
    select p.id from public.profiles p
    where p.role = 'vendor'
      and not exists (
        select 1 from public.vendor_credit_balances b where b.user_id = p.id
      )
  loop
    begin
      perform public.grant_credits(
        v_user_id, 100, 'trial_grant', null, null,
        'backfill: signup trial for existing vendor pre-credits-launch'
      );
      v_count := v_count + 1;
    exception when others then
      raise warning 'backfill failed for %: %', v_user_id, sqlerrm;
    end;
  end loop;
  raise notice 'backfilled trial credits for % existing vendor(s)', v_count;
end$$;
