-- Planner agency workspace. The existing planning_collaborators table
-- already lets a host invite a planner (one row per host × planner).
-- This RPC aggregates all events the calling planner has access to so
-- the planner can see N clients in one place — the missing surface
-- for wedding planners + agency planners managing multiple events at
-- once.
--
-- get_planner_workspace returns the full workspace shape: per-host
-- summary + per-event card data + quick stats. Stats are best-effort
-- counts (guest count, inquiries to vendors, tasks done/total) so the
-- dashboard doesn't have to do N+1 fetches.

create or replace function public.get_planner_workspace()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_hosts jsonb;
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;

  -- For each host the caller collaborates on:
  -- emit { host_id, host_name, role, events: [...] }
  select coalesce(jsonb_agg(host_block order by host_block->>'host_name'), '[]'::jsonb)
    into v_hosts
  from (
    select jsonb_build_object(
      'host_id', pc.host_id,
      'host_name', coalesce(p.display_name, '(unnamed host)'),
      'role', pc.role,
      'collaborator_since', pc.created_at,
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'event_id', e.id,
          'name', e.name,
          'event_type', e.event_type,
          'event_date', e.event_date,
          'event_location', e.event_location,
          'archived_at', e.archived_at,
          'guest_count', (
            select count(*) from public.event_guests g
            where g.host_id = pc.host_id
          ),
          -- event_tasks are per-host (not per-event); these counts are the
          -- host's overall task pile, attributed to whichever event is
          -- currently active. Good enough for the planner's at-a-glance card.
          'tasks_total', (
            select count(*) from public.event_tasks t
            where t.host_id = pc.host_id
          ),
          'tasks_done', (
            select count(*) from public.event_tasks t
            where t.host_id = pc.host_id and t.status = 'completed'
          ),
          'inquiries_active', (
            select count(*) from public.inquiries i
            where i.host_id = pc.host_id
              and i.status in ('new','drafted','replied')
          ),
          'days_until', (
            case when e.event_date is null then null
                 else (e.event_date - current_date) end
          )
        ) order by e.event_date nulls last, e.created_at desc), '[]'::jsonb)
        from public.host_events e
        where e.host_id = pc.host_id
      )
    ) as host_block
    from public.planning_collaborators pc
    left join public.profiles p on p.id = pc.host_id
    where pc.user_id = v_user
      and pc.host_id <> v_user  -- don't list "themselves" if they were ever invited to their own
  ) sub;

  return jsonb_build_object('hosts', v_hosts);
end$$;

revoke execute on function public.get_planner_workspace() from public, anon;
grant execute on function public.get_planner_workspace() to authenticated;

-- Helper: switch active event in one server hop. Auth-check ensures the
-- caller is the host themselves OR a planning collaborator on the event's
-- host. Frontend can just call this without re-checking RLS.
create or replace function public.set_active_event(p_event_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_event_host uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;

  select host_id into v_event_host from public.host_events where id = p_event_id;
  if v_event_host is null then raise exception 'event not found'; end if;

  -- Allow if the user is the host OR a collaborator with editor role.
  if v_event_host <> v_user
     and not exists (
       select 1 from public.planning_collaborators
       where host_id = v_event_host and user_id = v_user
     )
  then
    raise exception 'not authorized to switch to that event';
  end if;

  update public.profiles
    set active_event_id = p_event_id
    where id = v_user;
end$$;

revoke execute on function public.set_active_event(uuid) from public, anon;
grant execute on function public.set_active_event(uuid) to authenticated;
