create or replace function public.get_planner_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  v_user uuid := auth.uid();
  v_hosts jsonb;
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;

  select coalesce(jsonb_agg(host_block order by host_block->>'host_name'), '[]'::jsonb)
  into v_hosts
  from (
    select jsonb_build_object(
      'host_id', pc.host_id,
      'host_name', coalesce(p.display_name, '(unnamed host)'),
      'role', pc.role,
      'collaborator_since', pc.created_at,
      'events', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'event_id', e.id,
              'name', e.name,
              'event_type', e.event_type,
              'event_date', e.event_date,
              'event_location', e.event_location,
              'archived_at', e.archived_at,
              'guest_count', (select count(*) from public.event_guests g where g.host_id = pc.host_id),
              'tasks_total', (select count(*) from public.event_tasks t where t.host_id = pc.host_id),
              'tasks_done', (select count(*) from public.event_tasks t where t.host_id = pc.host_id and t.status = 'completed'),
              'inquiries_active', (select count(*) from public.inquiries i where i.host_id = pc.host_id and i.status in ('new','drafted','replied')),
              'days_until', case when e.event_date is null then null else (e.event_date - current_date) end
            )
            order by e.event_date nulls last, e.created_at desc
          )
          from public.host_events e
          where e.host_id = pc.host_id
        ),
        '[]'::jsonb
      )
    ) as host_block
    from public.planning_collaborators pc
    left join public.profiles p on p.id = pc.host_id
    where pc.user_id = v_user and pc.host_id <> v_user
  ) sub;

  return jsonb_build_object('hosts', v_hosts);
end
$func$;
revoke execute on function public.get_planner_workspace() from public, anon;
grant execute on function public.get_planner_workspace() to authenticated;

create or replace function public.set_active_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_user uuid := auth.uid();
  v_event_host uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select host_id into v_event_host from public.host_events where id = p_event_id;
  if v_event_host is null then raise exception 'event not found'; end if;
  if v_event_host <> v_user and not exists (
    select 1 from public.planning_collaborators where host_id = v_event_host and user_id = v_user
  ) then
    raise exception 'forbidden';
  end if;
  update public.profiles set active_event_id = p_event_id where id = v_user;
end
$func$;
revoke execute on function public.set_active_event(uuid) from public, anon;
grant execute on function public.set_active_event(uuid) to authenticated;