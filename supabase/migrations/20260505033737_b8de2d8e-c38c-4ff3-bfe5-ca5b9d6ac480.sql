alter table public.host_events
  add column if not exists microsite_token text unique default encode(gen_random_bytes(6), 'hex'),
  add column if not exists microsite_published_at timestamptz,
  add column if not exists microsite_title text,
  add column if not exists microsite_subtitle text,
  add column if not exists microsite_story text,
  add column if not exists microsite_cover_path text,
  add column if not exists microsite_theme text not null default 'classic'
    check (microsite_theme in ('classic','rose','sage','dusk','midnight','champagne')),
  add column if not exists microsite_show_schedule boolean not null default true,
  add column if not exists microsite_show_rsvp boolean not null default true,
  add column if not exists microsite_show_registry boolean not null default true,
  add column if not exists microsite_show_gifts boolean not null default true,
  add column if not exists microsite_show_gallery boolean not null default true;

update public.host_events set microsite_token = encode(gen_random_bytes(6), 'hex') where microsite_token is null;

insert into storage.buckets (id, name, public) values ('event-microsites', 'event-microsites', true) on conflict (id) do nothing;

create policy "event microsites public read" on storage.objects for select using (bucket_id = 'event-microsites');
create policy "event microsites host insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-microsites' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "event microsites host delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-microsites' and (storage.foldername(name))[1] = auth.uid()::text);

create table public.event_microsite_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.host_events(id) on delete cascade,
  storage_path text not null,
  caption text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index event_microsite_photos_event_idx on public.event_microsite_photos (event_id, display_order, created_at);
alter table public.event_microsite_photos enable row level security;
create policy "event_microsite_photos public read" on public.event_microsite_photos for select using (true);
create policy "event_microsite_photos host insert" on public.event_microsite_photos for insert to authenticated
  with check (exists (select 1 from public.host_events e where e.id = event_id and e.host_id = auth.uid()));
create policy "event_microsite_photos host update" on public.event_microsite_photos for update to authenticated
  using (exists (select 1 from public.host_events e where e.id = event_id and e.host_id = auth.uid()));
create policy "event_microsite_photos host delete" on public.event_microsite_photos for delete to authenticated
  using (exists (select 1 from public.host_events e where e.id = event_id and e.host_id = auth.uid()));

create or replace function public.get_microsite_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event record; v_host_name text; v_schedule jsonb; v_registry jsonb; v_gifts jsonb; v_photos jsonb;
begin
  select * into v_event from public.host_events
    where microsite_token = p_token and microsite_published_at is not null and archived_at is null;
  if v_event.id is null then return null; end if;
  select coalesce(display_name, 'A Vendora host') into v_host_name from public.profiles where id = v_event.host_id;
  if v_event.microsite_show_schedule then
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'notes',t.notes,'start_time',t.start_time,'duration_minutes',t.duration_minutes,'location',t.location) order by t.start_time, t.display_order), '[]'::jsonb)
      into v_schedule from public.event_timeline_items t where t.event_id = v_event.id;
  else v_schedule := '[]'::jsonb; end if;
  if v_event.microsite_show_registry then
    select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'provider',r.provider,'url',r.url,'description',r.description) order by r.display_order, r.created_at), '[]'::jsonb)
      into v_registry from public.event_registry_links r where r.host_id = v_event.host_id;
  else v_registry := '[]'::jsonb; end if;
  if v_event.microsite_show_gifts then
    select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'description',w.description,'image_url',w.image_url,'target_cents',w.target_cents,'share_token',w.share_token,
      'pledged_cents', coalesce((select sum(p.amount_cents)::int from public.gift_pledges p where p.wish_id = w.id), 0)
    ) order by w.created_at desc), '[]'::jsonb)
      into v_gifts from public.gift_wishes w where w.host_id = v_event.host_id;
  else v_gifts := '[]'::jsonb; end if;
  if v_event.microsite_show_gallery then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'storage_path',p.storage_path,'caption',p.caption) order by p.display_order, p.created_at), '[]'::jsonb)
      into v_photos from public.event_microsite_photos p where p.event_id = v_event.id;
  else v_photos := '[]'::jsonb; end if;
  return jsonb_build_object('event', jsonb_build_object('id',v_event.id,'name',v_event.name,'event_type',v_event.event_type,'event_date',v_event.event_date,'event_location',v_event.event_location,
    'microsite_title',v_event.microsite_title,'microsite_subtitle',v_event.microsite_subtitle,'microsite_story',v_event.microsite_story,'microsite_cover_path',v_event.microsite_cover_path,
    'microsite_theme',v_event.microsite_theme,'microsite_show_rsvp',v_event.microsite_show_rsvp,'host_name',v_host_name),
    'schedule',v_schedule,'registry',v_registry,'gifts',v_gifts,'photos',v_photos);
end$$;

revoke execute on function public.get_microsite_by_token(text) from public;
grant execute on function public.get_microsite_by_token(text) to anon, authenticated;