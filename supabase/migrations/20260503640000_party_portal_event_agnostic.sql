-- Update party-portal copy to be event-agnostic. The original
-- migration's notification said "joined your wedding party" — Vendora
-- isn't wedding-only, so this updates the in-app notification to read
-- generically. Schema is unchanged — just a function body swap.

create or replace function public.notify_host_party_accepted()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_member_name text;
begin
  if new.accepted_at is null or old.accepted_at is not null then return new; end if;
  select coalesce(display_name, new.email) into v_member_name
    from public.profiles where id = new.member_user_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.host_id,
    'party_invite_accepted',
    v_member_name || ' joined your inner circle',
    'They can now see the schedule, vendors, and any tasks you assign.',
    '/customer/planning-team'
  );
  return new;
end$$;

revoke execute on function public.notify_host_party_accepted() from public, anon, authenticated;
