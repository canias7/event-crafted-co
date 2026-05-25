-- VendoraPay Phase 1 — add the columns the charge endpoint + webhook
-- need to track payment state on a proposal.
--
-- payment_status flow (set ONLY by vendorapay-webhook via service_role):
--   'pending' → 'deposit_paid' → 'paid_in_full'
--                            ↘ 'refunded' / 'partial_refund'
--
-- stripe_checkout_session_id holds the PaymentIntent id we stamped at
-- charge time, so the webhook's charge.refunded handler can find the
-- proposal from a refund event (which only carries the PI id).
--
-- Both columns are protected by the trigger below — even though
-- proposals RLS lets the host and the vendor UPDATE the row, the
-- trigger rejects writes to these two fields unless the current
-- session role is service_role (which the edge functions use). This
-- prevents a malicious host from PATCHing payment_status to
-- 'paid_in_full' over the supabase-js client and skipping payment.

alter table public.proposals
  add column if not exists payment_status text not null default 'pending',
  add column if not exists stripe_checkout_session_id text;

-- Constrain payment_status to a known set so a bad webhook event
-- can't sneak in arbitrary state.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'proposals_payment_status_chk'
      and conrelid = 'public.proposals'::regclass
  ) then
    alter table public.proposals
      add constraint proposals_payment_status_chk
      check (
        payment_status in (
          'pending',
          'deposit_paid',
          'paid_in_full',
          'refunded',
          'partial_refund'
        )
      );
  end if;
end$$;

create index if not exists proposals_stripe_session_idx
  on public.proposals (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Lock down writes from RLS callers. RLS already enforces "host can
-- update their own proposal" and "vendor can update their team's
-- proposals" — but those broad policies let either side flip
-- payment_status, which means the host could mark themselves paid
-- without paying. This trigger blocks payment_status /
-- stripe_checkout_session_id changes unless the current session is
-- service_role (edge functions use the service role key).

-- Trigger function is SECURITY INVOKER (default). SECURITY DEFINER
-- would resolve current_user to the function owner (postgres) and
-- silently bypass the check for everyone — we tested that during
-- the audit and it failed open. With INVOKER, current_user reflects
-- the SET ROLE that PostgREST performs based on the JWT:
-- 'authenticated' / 'anon' for end-users, 'service_role' for edge
-- functions using the service role key.
create or replace function public.proposals_protect_vendorapay_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'service_role'
     or current_user = 'postgres'
     or current_user = 'supabase_admin'
     or pg_has_role(current_user, 'postgres', 'MEMBER') then
    return new;
  end if;
  if new.payment_status is distinct from old.payment_status then
    raise exception 'payment_status is read-only (set via VendoraPay webhook)';
  end if;
  if new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id then
    raise exception 'stripe_checkout_session_id is read-only';
  end if;
  return new;
end;
$$;

drop trigger if exists proposals_protect_vendorapay_fields_trg on public.proposals;
create trigger proposals_protect_vendorapay_fields_trg
  before update of payment_status, stripe_checkout_session_id on public.proposals
  for each row
  execute function public.proposals_protect_vendorapay_fields();
