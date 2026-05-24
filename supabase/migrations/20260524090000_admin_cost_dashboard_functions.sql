-- Admin cost dashboard: SECURITY DEFINER functions that join
-- vendor_credit_transactions (what the vendor was charged in credits)
-- against ai_call_usage (what we actually paid upstream) so the admin
-- panel can show real per-call margin instead of averages.
--
-- Why functions, not a view: ai_call_usage is RLS-locked to
-- service-role only (cost data is competitive). A view inherits
-- caller perms; a SECURITY DEFINER function checks is_admin() and
-- bypasses RLS for legitimate admins without exposing the underlying
-- table.

-- Per-user blended $/credit. Subscription price/credits when the
-- vendor is on a tier; fall back to Boost top-up rate ($0.024) for
-- free/canceled vendors so we never divide by zero on margin.
create or replace function public.user_effective_usd_per_credit(p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select round((vcp.unit_amount_cents::numeric / 100) / vcp.credits, 6)
      from public.profiles p
      join public.vendor_credit_packages vcp
        on vcp.tier = p.subscription_tier
       and vcp.kind = 'subscription'
       and vcp.active = true
      where p.id = p_user
      limit 1
    ),
    0.024
  );
$$;

-- Per-call P&L for the recent-activity table on the admin dashboard.
-- One row per credit-consume transaction. Joins the matching
-- ai_call_usage rows by user_id + action_type prefix + close time
-- (matches both 'hilux_reply' and 'hilux_reply_lead_score').
create or replace function public.admin_cost_recent(
  p_since timestamptz default (now() - interval '24 hours'),
  p_limit integer default 200
)
returns table (
  txn_id bigint,
  created_at timestamptz,
  user_id uuid,
  user_email text,
  user_tier text,
  action_type text,
  credits integer,
  usd_per_credit numeric,
  revenue_usd numeric,
  cogs_usd numeric,
  margin_usd numeric,
  margin_pct numeric,
  ref_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with admin_ok as (
    select case when public.is_admin() then 1 else null end as ok
  ),
  per_call as (
    select
      vct.id,
      vct.created_at,
      vct.user_id,
      vct.action_type,
      abs(vct.delta) as credits,
      vct.ref_id,
      public.user_effective_usd_per_credit(vct.user_id) as rate,
      coalesce((
        select sum(cost_micros)::numeric / 1000000
        from public.ai_call_usage acu
        where acu.user_id = vct.user_id
          and (
            acu.action_type = vct.action_type
            or acu.action_type like vct.action_type || E'\\_%' escape E'\\'
          )
          and acu.created_at between vct.created_at - interval '5 seconds'
                                and vct.created_at + interval '30 seconds'
      ), 0) as cogs_usd
    from public.vendor_credit_transactions vct, admin_ok
    where vct.kind = 'consume'
      and vct.created_at >= p_since
      and admin_ok.ok is not null
    order by vct.created_at desc
    limit greatest(1, least(p_limit, 1000))
  )
  select
    pc.id as txn_id,
    pc.created_at,
    pc.user_id,
    (select email::text from auth.users where id = pc.user_id) as user_email,
    (select subscription_tier::text from public.profiles where id = pc.user_id) as user_tier,
    pc.action_type,
    pc.credits,
    round(pc.rate, 6) as usd_per_credit,
    round(pc.credits * pc.rate, 6) as revenue_usd,
    round(pc.cogs_usd, 6) as cogs_usd,
    round(pc.credits * pc.rate - pc.cogs_usd, 6) as margin_usd,
    case
      when pc.credits * pc.rate > 0
        then round(100 * (1 - pc.cogs_usd / (pc.credits * pc.rate)), 2)
      else 0
    end as margin_pct,
    pc.ref_id
  from per_call pc;
$$;

-- Per-action summary for the dashboard topline. Sums revenue (credits
-- × user's blended rate) and COGS over the period, grouped by action.
create or replace function public.admin_cost_summary(
  p_since timestamptz default (now() - interval '7 days')
)
returns table (
  action_type text,
  call_count bigint,
  credits_consumed bigint,
  revenue_usd numeric,
  cogs_usd numeric,
  margin_usd numeric,
  margin_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with admin_ok as (
    select case when public.is_admin() then 1 else null end as ok
  ),
  consumes as (
    select
      vct.action_type,
      count(*) as cnt,
      sum(abs(vct.delta))::bigint as credits,
      sum(abs(vct.delta) * public.user_effective_usd_per_credit(vct.user_id)) as revenue
    from public.vendor_credit_transactions vct, admin_ok
    where vct.kind = 'consume'
      and vct.created_at >= p_since
      and admin_ok.ok is not null
    group by vct.action_type
  ),
  costs as (
    select
      -- Roll '<action>_lead_score' rows into the parent action so the
      -- summary line for hilux_reply includes both the main + side call.
      case
        when acu.action_type like '%\_lead\_score' escape E'\\'
          then regexp_replace(acu.action_type, '_lead_score$', '')
        else acu.action_type
      end as action_type,
      sum(cost_micros)::numeric / 1000000 as cogs
    from public.ai_call_usage acu, admin_ok
    where acu.created_at >= p_since
      and admin_ok.ok is not null
    group by 1
  )
  select
    coalesce(c.action_type, x.action_type) as action_type,
    coalesce(c.cnt, 0) as call_count,
    coalesce(c.credits, 0) as credits_consumed,
    round(coalesce(c.revenue, 0), 4) as revenue_usd,
    round(coalesce(x.cogs, 0), 4) as cogs_usd,
    round(coalesce(c.revenue, 0) - coalesce(x.cogs, 0), 4) as margin_usd,
    case
      when coalesce(c.revenue, 0) > 0
        then round(100 * (1 - coalesce(x.cogs, 0) / c.revenue), 2)
      else 0
    end as margin_pct
  from consumes c
  full outer join costs x on x.action_type = c.action_type
  order by 4 desc;
$$;

-- Grant execute to authenticated; the function bodies enforce
-- is_admin() so non-admins get empty results.
grant execute on function public.user_effective_usd_per_credit(uuid) to authenticated;
grant execute on function public.admin_cost_recent(timestamptz, integer) to authenticated;
grant execute on function public.admin_cost_summary(timestamptz) to authenticated;
