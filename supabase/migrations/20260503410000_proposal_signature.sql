-- Lightweight built-in e-signature on proposal acceptance. We don't
-- integrate DocuSign yet — for an early-stage marketplace the legal
-- bar is "did the host knowingly agree to these terms with their
-- identity attached" (UETA / E-SIGN Act recognize this when the
-- intent + attribution + record is captured). This adds:
--   * a typed legal name (signed_name) — the host's intent
--   * a timestamp + user_agent + the supabase auth user_id (already
--     in host_id) — attribution + record
-- Hosts still hit "Accept" but now go through a signature dialog.

alter table public.proposals
  add column if not exists signed_at timestamptz,
  add column if not exists signed_name text,
  add column if not exists signed_user_agent text;

-- When status flips to 'accepted', `respond_at` must include a
-- timestamp; require signature too if the proposal includes a
-- contract_body or terms (the binding portions). Soft-enforced via
-- trigger so legacy accepted rows aren't invalidated.
create or replace function public.enforce_proposal_signature()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'accepted'
     and (old.status is null or old.status <> 'accepted')
     and (new.contract_body is not null or new.terms is not null)
     and (new.signed_name is null or new.signed_at is null) then
    raise exception 'Accepting a proposal with terms or a contract requires a signature (typed legal name)';
  end if;
  return new;
end$$;

drop trigger if exists proposals_enforce_signature on public.proposals;
create trigger proposals_enforce_signature
  before update of status on public.proposals
  for each row execute function public.enforce_proposal_signature();

revoke execute on function public.enforce_proposal_signature() from public, anon, authenticated;
