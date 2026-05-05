-- Generous per-host rate limit on inquiry inserts to stop runaway
-- clients (a buggy retry loop, a malicious script, an abusive host
-- spamming vendors). Threshold is set well above any legitimate
-- usage pattern — even an inquiry-blast against every vendor in a
-- category should stay under 50 in a minute, and the cap here is
-- 100/min/host. We re-evaluate if real users hit it.
--
-- Implementation: BEFORE INSERT trigger that counts the host's
-- inquiry rows in the last 60 seconds. Adds an index on
-- (host_id, created_at desc) so the count query is O(log n) instead
-- of a sequential scan — also helps the host-side "my inquiries"
-- listing.

create index if not exists inquiries_host_created_idx
  on public.inquiries (host_id, created_at desc);

create or replace function public.tg_inquiries_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  recent_count integer;
begin
  -- Skip the check for service-role inserts (admin tools, edge
  -- functions). auth.role() returns 'service_role' for those.
  if auth.role() = 'service_role' then
    return NEW;
  end if;

  select count(*)
    into recent_count
    from public.inquiries
    where host_id = NEW.host_id
      and created_at > now() - interval '1 minute';

  if recent_count >= 100 then
    raise exception 'Inquiry rate limit hit — please wait a minute before sending more.'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists inquiries_rate_limit on public.inquiries;
create trigger inquiries_rate_limit
  before insert on public.inquiries
  for each row execute function public.tg_inquiries_rate_limit();
