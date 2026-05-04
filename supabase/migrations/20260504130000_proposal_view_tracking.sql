-- Proposal view tracking: lets the vendor see when the host opened
-- their proposal. Same pattern as email open tracking — gives the
-- vendor a strong signal for follow-up timing.
--
-- We track first_viewed_at + view_count + last_viewed_at on the
-- proposal row itself (cheap, no separate table needed for v1). The
-- update happens via a SECURITY DEFINER RPC because the host's RLS
-- only allows SELECT, not UPDATE on proposals.

alter table public.proposals
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists view_count integer not null default 0;

-- RPC: marks a proposal as viewed by the calling host. Verifies the
-- caller is the proposal's host_id, then bumps timestamps and counter.
-- Idempotent within the same minute to avoid noisy double-counts from
-- React strict-mode + page revisits.
create or replace function public.mark_proposal_viewed(p_proposal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_host_id uuid;
  v_last timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  select host_id, last_viewed_at into v_host_id, v_last
    from public.proposals
    where id = p_proposal_id;

  if v_host_id is null or v_host_id <> auth.uid() then
    return;
  end if;

  -- Debounce: don't bump if last view was within 60 seconds.
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return;
  end if;

  update public.proposals
  set first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now(),
      view_count = view_count + 1
  where id = p_proposal_id;
end;
$$;

grant execute on function public.mark_proposal_viewed(uuid) to authenticated;
