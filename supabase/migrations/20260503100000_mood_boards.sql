-- Mood boards: hosts collect inspiration imagery (uploads + URLs from
-- around the web) into named boards they can browse, reorder, and
-- optionally share with vendors via a public token link.
--
-- Two tables:
--   mood_boards        — board container per host
--   mood_board_items   — individual pinned images on a board
--
-- Storage bucket "mood-board-images" holds uploaded files; external
-- URLs (Pinterest pins, instagram screenshots, etc.) live as image_url
-- without going through storage.

create table public.mood_boards (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  cover_image_url text,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mood_boards_host_idx
  on public.mood_boards (host_id, created_at desc);

create index mood_boards_share_token_idx
  on public.mood_boards (share_token);

alter table public.mood_boards enable row level security;

create policy "mood_boards owner select"
  on public.mood_boards for select
  to authenticated
  using (host_id = auth.uid());

create policy "mood_boards owner insert"
  on public.mood_boards for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "mood_boards owner update"
  on public.mood_boards for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "mood_boards owner delete"
  on public.mood_boards for delete
  to authenticated
  using (host_id = auth.uid());

create trigger mood_boards_updated
  before update on public.mood_boards
  for each row execute function public.tg_set_updated_at();

-- Pinned items. image_url either points at the public storage bucket
-- (uploaded files) or at an external URL.
create table public.mood_board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.mood_boards(id) on delete cascade,
  image_url text not null,
  source_url text,
  caption text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index mood_board_items_board_idx
  on public.mood_board_items (board_id, display_order, created_at);

alter table public.mood_board_items enable row level security;

create policy "mood_board_items owner select"
  on public.mood_board_items for select
  to authenticated
  using (
    exists (
      select 1 from public.mood_boards b
      where b.id = board_id and b.host_id = auth.uid()
    )
  );

create policy "mood_board_items owner insert"
  on public.mood_board_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.mood_boards b
      where b.id = board_id and b.host_id = auth.uid()
    )
  );

create policy "mood_board_items owner update"
  on public.mood_board_items for update
  to authenticated
  using (
    exists (
      select 1 from public.mood_boards b
      where b.id = board_id and b.host_id = auth.uid()
    )
  );

create policy "mood_board_items owner delete"
  on public.mood_board_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.mood_boards b
      where b.id = board_id and b.host_id = auth.uid()
    )
  );

-- Storage bucket for uploaded pin imagery. Public so vendors viewing a
-- shared board don't need auth. Owner-only writes enforced by storage
-- policies — folder named with host's user_id.
insert into storage.buckets (id, name, public)
values ('mood-board-images', 'mood-board-images', true)
on conflict (id) do nothing;

create policy "mood board images public read"
  on storage.objects for select
  using (bucket_id = 'mood-board-images');

create policy "mood board images owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'mood-board-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "mood board images owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'mood-board-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public share access: SECURITY DEFINER function returns the board
-- and items by share_token without requiring auth. Vendors paste the
-- /board/<token> link into a browser and see the board.
create or replace function public.get_mood_board_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board public.mood_boards;
  v_items jsonb;
begin
  select * into v_board
  from public.mood_boards
  where share_token = p_token;

  if v_board.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'image_url', i.image_url,
      'source_url', i.source_url,
      'caption', i.caption,
      'display_order', i.display_order
    ) order by i.display_order, i.created_at
  ), '[]'::jsonb)
  into v_items
  from public.mood_board_items i
  where i.board_id = v_board.id;

  return jsonb_build_object(
    'id', v_board.id,
    'name', v_board.name,
    'description', v_board.description,
    'cover_image_url', v_board.cover_image_url,
    'created_at', v_board.created_at,
    'items', v_items
  );
end;
$$;

grant execute on function public.get_mood_board_by_token(text) to anon, authenticated;
