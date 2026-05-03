-- Vendor SLA badges: a denormalized "responder_tier" on vendor_profiles
-- recomputed daily by a cron-scheduled scanner. Avoids a per-card join
-- across messages + inquiries on every directory render.
--
-- Tiers:
--   'fast'      — median first-reply time ≤ 3 hours over last 90 days,
--                 across ≥ 3 inquiries
--   'standard'  — has data but doesn't qualify as fast
--   null        — fewer than 3 replied inquiries in the window (no signal)

alter table public.vendor_profiles
  add column if not exists responder_tier text
    check (responder_tier in ('fast','standard') or responder_tier is null);

-- Index over the tier so directory filtering is fast (e.g. "show fast
-- responders only" — UI not exposed yet but the index pays for itself
-- on every directory render where we count badges).
create index if not exists vendor_profiles_responder_tier_idx
  on public.vendor_profiles (responder_tier)
  where responder_tier is not null;

-- Atomically recomputes the tier across all vendors. Returns one row
-- per vendor whose tier changed so the scanner can log/observe.
create or replace function public.recompute_vendor_responder_tiers(
  p_window_days int default 90,
  p_fast_hours numeric default 3,
  p_min_replies int default 3
)
returns table (
  vendor_id uuid,
  prev_tier text,
  new_tier text,
  reply_count int,
  median_hours numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_new_tier text;
begin
  for r in
    -- For each vendor, compute the median (in hours) of the time from
    -- inquiry created → first vendor message, over the window.
    with first_replies as (
      select
        i.vendor_id,
        i.id as inquiry_id,
        min(m.created_at) as first_reply_at,
        i.created_at as inquiry_at
      from public.inquiries i
      join public.messages m on m.inquiry_id = i.id
      where m.sender_role = 'vendor'
        and i.created_at >= (now() - make_interval(days => p_window_days))
      group by i.id, i.vendor_id, i.created_at
    ),
    per_vendor as (
      select
        fr.vendor_id,
        count(*)::int as reply_count,
        percentile_cont(0.5) within group (
          order by extract(epoch from (fr.first_reply_at - fr.inquiry_at)) / 3600.0
        ) as median_hours
      from first_replies fr
      group by fr.vendor_id
    )
    select vp.id, vp.responder_tier, pv.reply_count, pv.median_hours
    from public.vendor_profiles vp
    left join per_vendor pv on pv.vendor_id = vp.id
  loop
    if r.reply_count is null or r.reply_count < p_min_replies then
      v_new_tier := null;
    elsif r.median_hours <= p_fast_hours then
      v_new_tier := 'fast';
    else
      v_new_tier := 'standard';
    end if;

    if coalesce(v_new_tier, '') <> coalesce(r.responder_tier, '') then
      update public.vendor_profiles
      set responder_tier = v_new_tier
      where id = r.id;

      vendor_id := r.id;
      prev_tier := r.responder_tier;
      new_tier := v_new_tier;
      reply_count := coalesce(r.reply_count, 0);
      median_hours := r.median_hours;
      return next;
    end if;
  end loop;
end$$;

grant execute on function public.recompute_vendor_responder_tiers(int, numeric, int)
  to service_role;
