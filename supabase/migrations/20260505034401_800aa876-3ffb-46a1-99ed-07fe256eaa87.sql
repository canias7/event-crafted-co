create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject text not null,
  category text not null default 'other' check (category in ('account','billing','booking','vendor_issue','bug','feature_request','other')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_admin_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status, priority desc, created_at desc);
alter table public.support_tickets enable row level security;
create policy "support_tickets own select" on public.support_tickets for select to authenticated using (auth.uid() = user_id or public.is_admin());
create policy "support_tickets own insert" on public.support_tickets for insert to authenticated with check (auth.uid() = user_id);
create policy "support_tickets admin update" on public.support_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "support_tickets own close" on public.support_tickets for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger support_tickets_updated before update on public.support_tickets for each row execute function public.tg_set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null,
  sender_role text not null check (sender_role in ('user','admin')),
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);
alter table public.support_messages enable row level security;
create policy "support_messages participant select" on public.support_messages for select to authenticated
  using (public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create policy "support_messages participant insert" on public.support_messages for insert to authenticated
  with check (sender_id = auth.uid() and (
    (sender_role = 'admin' and public.is_admin())
    or (sender_role = 'user' and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()))));

create or replace function public.notify_admins_support_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_user_name text; v_subject text; v_link text;
begin
  select t.subject, p.display_name into v_subject, v_user_name
    from public.support_tickets t left join public.profiles p on p.id = t.user_id where t.id = new.ticket_id;
  v_link := '/admin/support?ticket=' || new.ticket_id::text;
  if new.sender_role = 'user' then
    for r in select id from public.profiles where role = 'admin' loop
      insert into public.notifications (user_id, type, title, body, link)
      values (r.id, 'support_ticket_message', coalesce(v_user_name, 'A user') || ' wrote in support', v_subject, v_link);
    end loop;
  end if;
  return new;
end$$;
create trigger support_messages_notify_admins after insert on public.support_messages
  for each row execute function public.notify_admins_support_event();

create or replace function public.notify_user_support_admin_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_subject text;
begin
  if new.sender_role <> 'admin' then return new; end if;
  select user_id, subject into v_user, v_subject from public.support_tickets where id = new.ticket_id;
  if v_user is null then return new; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (v_user, 'support_ticket_reply', 'Support replied: ' || coalesce(v_subject, 'your ticket'), substring(new.body for 140), '/support?ticket=' || new.ticket_id::text);
  return new;
end$$;
create trigger support_messages_notify_user after insert on public.support_messages
  for each row execute function public.notify_user_support_admin_reply();
revoke execute on function public.notify_admins_support_event() from public, anon, authenticated;
revoke execute on function public.notify_user_support_admin_reply() from public, anon, authenticated;