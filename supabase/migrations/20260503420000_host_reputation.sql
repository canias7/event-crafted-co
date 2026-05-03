-- Host reputation: vendors deserve trust signals on the hosts they're
-- about to spend hours quoting for. Computed from real platform
-- behavior (inquiry follow-through, message response, booking rate)
-- plus vendor-supplied flags after a completed event.
--
-- Design notes:
--   * No public-facing "host score" — only vendors with a pre-existing
--     inquiry from that host can see the signals. Otherwise hosts get
--     judged before they've even talked to anyone.
--   * A SECURITY DEFINER RPC bypasses RLS once the caller passes the
--     inquiry-relationship check.
--   * Flags are vendor-private (each vendor sees only their own flags
--     in the raw table; the aggregate roll-up is what cross-pollinates).

-- Vendor-supplied post-event flags. One per (vendor, host, inquiry, flag_type)
-- so a vendor can layer multiple flags on the same engagement.
create table public.host_reliability_flags (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  flag_type text not null check (flag_type in (
    'no_show',         -- booked, didn't show up
    'unresponsive',    -- went dark mid-conversation
    'paid_late',       -- deposit / installment was late
    'pleasant',        -- positive — easy to work with
    'great_communication', -- positive — quick replies
    'rebooked'         -- positive — booked the vendor again
  )),
  note text,
  created_at timestamptz not null default now()
);

create index host_reliability_flags_host_idx
  on public.host_reliability_flags (host_id, created_at desc);
create index host_reliability_flags_vendor_idx
  on public.host_reliability_flags (vendor_id, created_at desc);

alter table public.host_reliability_flags enable row level security;

-- Vendor reads / writes their own flags.
create policy "host_reliability_flags vendor select"
  on public.host_reliability_flags for select to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "host_reliability_flags vendor insert"
  on public.host_reliability_flags for insert to authenticated
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
    and exists (
      -- Vendor can only flag a host they actually had an inquiry with.
      select 1 from public.inquiries i
      where i.host_id = host_reliability_flags.host_id
        and i.vendor_id = host_reliability_flags.vendor_id
    )
  );

create policy "host_reliability_flags vendor delete"
  on public.host_reliability_flags for delete to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

-- SECURITY DEFINER: any vendor with at least one inquiry from this host
-- can read the rolled-up reputation. Returns the aggregate signals + a
-- coarse tier band.
create or replace function public.get_host_reputation(p_host_id uuid)
returns table (
  total_inquiries int,
  bookings int,
  ghosted int,
  response_rate numeric,
  booking_rate numeric,
  positive_flags int,
  negative_flags int,
  joined_at timestamptz,
  tier text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_caller_vendor uuid;
  v_total int;
  v_bookings int;
  v_ghosted int;
  v_replied int;
  v_responded_to int;
  v_pos int;
  v_neg int;
  v_joined timestamptz;
  v_response_rate numeric;
  v_booking_rate numeric;
  v_tier text;
begin
  -- Authorize: caller must own a vendor_profile that has had at least
  -- one inquiry from this host. Otherwise we'd leak the score.
  select vp.id into v_caller_vendor
    from public.vendor_profiles vp
    join public.inquiries i on i.vendor_id = vp.id
    where vp.user_id = auth.uid()
      and i.host_id = p_host_id
    limit 1;
  if v_caller_vendor is null then
    raise exception 'Not authorized to view this host''s reputation';
  end if;

  -- Aggregate signals across ALL of the host's inquiries (not just this
  -- vendor's). This is the cross-pollination that makes it useful.
  select count(*),
         count(*) filter (where status = 'won'),
         count(*) filter (where status = 'expired')
    into v_total, v_bookings, v_ghosted
    from public.inquiries
    where host_id = p_host_id;

  -- Response rate: of inquiries where the vendor replied, how many had a
  -- subsequent host reply? Approximate via message counts per role.
  select
    count(distinct i.id) filter (where exists (
      select 1 from public.messages m
      where m.inquiry_id = i.id and m.sender_role = 'vendor'
    )),
    count(distinct i.id) filter (where exists (
      select 1 from public.messages m1
      where m1.inquiry_id = i.id and m1.sender_role = 'vendor'
    ) and exists (
      select 1 from public.messages m2
      where m2.inquiry_id = i.id and m2.sender_role = 'host'
            and m2.created_at > (
              select min(created_at) from public.messages
              where inquiry_id = i.id and sender_role = 'vendor'
            )
    ))
    into v_responded_to, v_replied
    from public.inquiries i
    where i.host_id = p_host_id;

  -- Flag aggregates.
  select
    count(*) filter (where flag_type in ('pleasant','great_communication','rebooked')),
    count(*) filter (where flag_type in ('no_show','unresponsive','paid_late'))
    into v_pos, v_neg
    from public.host_reliability_flags
    where host_id = p_host_id;

  select created_at into v_joined
    from public.profiles
    where id = p_host_id;

  v_response_rate := case when v_responded_to > 0
                          then round(v_replied::numeric / v_responded_to, 2)
                          else null end;
  v_booking_rate := case when v_total > 0
                         then round(v_bookings::numeric / v_total, 2)
                         else null end;

  -- Coarse tier. Conservative — under-promise on trust signals.
  v_tier := case
    when v_neg >= 2 then 'caution'
    when v_bookings >= 5 and (v_response_rate is null or v_response_rate >= 0.85) and v_neg = 0 then 'top'
    when v_total >= 3 and (v_response_rate is null or v_response_rate >= 0.6) and (v_booking_rate is null or v_booking_rate >= 0.25) then 'reliable'
    else 'new'
  end;

  return query select
    v_total, v_bookings, v_ghosted,
    v_response_rate, v_booking_rate,
    v_pos, v_neg, v_joined, v_tier;
end$$;

revoke execute on function public.get_host_reputation(uuid) from public, anon;
grant execute on function public.get_host_reputation(uuid) to authenticated;
