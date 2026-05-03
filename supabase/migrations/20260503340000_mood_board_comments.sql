-- Public mood-board comments: vendors (or anyone with the share link)
-- can leave notes on a board so the host gets vendor input on direction
-- ("loved this palette, here's how I'd execute"). Auth-required to
-- comment, but public read so anyone with the share token can see.

create table public.mood_board_comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.mood_boards(id) on delete cascade,
  -- Optional: when an item_id is set, the comment is pinned to a specific
  -- pin (useful for "I'd swap these flowers" feedback). Null = whole-board
  -- comment.
  item_id uuid references public.mood_board_items(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index mood_board_comments_board_idx
  on public.mood_board_comments (board_id, created_at desc);

create index mood_board_comments_item_idx
  on public.mood_board_comments (item_id)
  where item_id is not null;

alter table public.mood_board_comments enable row level security;

-- Public read so the share page renders comments without auth — same
-- trust model as the board itself (anyone with the share token).
create policy "mood_board_comments public read"
  on public.mood_board_comments for select using (true);

-- Auth required to comment. Authors can edit/delete only their own.
create policy "mood_board_comments author insert"
  on public.mood_board_comments for insert to authenticated
  with check (author_id = auth.uid());

create policy "mood_board_comments author update"
  on public.mood_board_comments for update to authenticated
  using (author_id = auth.uid());

create policy "mood_board_comments author delete"
  on public.mood_board_comments for delete to authenticated
  using (author_id = auth.uid());

-- Board owner can also delete any comment on their board (moderation).
create policy "mood_board_comments owner delete"
  on public.mood_board_comments for delete to authenticated
  using (
    exists (
      select 1 from public.mood_boards b
      where b.id = mood_board_comments.board_id
        and b.host_id = auth.uid()
    )
  );

-- Notify the host when someone comments on their board.
create or replace function public.notify_mood_board_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_host uuid;
  v_board_name text;
begin
  select b.host_id, b.name into v_host, v_board_name
  from public.mood_boards b where b.id = new.board_id;
  if v_host is null or v_host = new.author_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_host,
    'mood_board_comment',
    new.author_name || ' commented on "' || coalesce(v_board_name, 'your board') || '"',
    left(new.body, 120),
    '/customer/moodboards/' || new.board_id::text
  );
  return new;
end$$;

create trigger mood_board_comments_notify
  after insert on public.mood_board_comments
  for each row execute function public.notify_mood_board_comment();

-- Public lookup of comments by share token. Lets the share page render
-- comments without going through RLS (and without exposing the board's
-- raw id to anonymous traffic).
create or replace function public.get_mood_board_comments_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid;
begin
  select id into v_board_id from public.mood_boards where share_token = p_token;
  if v_board_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'item_id', c.item_id,
        'author_name', c.author_name,
        'body', c.body,
        'created_at', c.created_at
      ) order by c.created_at desc
    )
    from public.mood_board_comments c
    where c.board_id = v_board_id
  ), '[]'::jsonb);
end$$;

grant execute on function public.get_mood_board_comments_by_token(text)
  to anon, authenticated;
