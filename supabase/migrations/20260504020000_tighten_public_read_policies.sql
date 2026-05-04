-- Tightens two SELECT policies that were created with `using (true)`
-- but were only ever meant to be reachable via share-token RPCs.
--
-- Original intent (per migration comments) was "public via share
-- token so guests can view without auth." Implementation gave any
-- anon-key client the ability to enumerate the full table, which
-- leaks gift registries + mood-board comments across the platform.
--
-- Public reach is preserved by the existing SECURITY DEFINER RPCs
-- (get_gift_wish_by_token, get_mood_board_comments_by_token) which
-- bypass RLS by design.
--
-- App-side direct reads:
--   gift_wishes: only `.eq("host_id", user.id)` — works with the
--   tightened policy.
--   mood_board_comments: only authenticated INSERTs — read goes
--   through the RPC.

-- ─── gift_wishes ───────────────────────────────────────────────────

drop policy if exists "gift_wishes public read" on public.gift_wishes;

create policy "gift_wishes host read"
  on public.gift_wishes for select to authenticated
  using (auth.uid() = host_id);

-- ─── mood_board_comments ──────────────────────────────────────────

drop policy if exists "mood_board_comments public read"
  on public.mood_board_comments;

-- Authenticated users can read comments on boards they own or
-- comments they themselves wrote. Anyone with a share token reaches
-- comments through get_mood_board_comments_by_token (SECURITY
-- DEFINER), so the public path keeps working.
create policy "mood_board_comments owner or author read"
  on public.mood_board_comments for select to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.mood_boards b
      where b.id = board_id and b.host_id = auth.uid()
    )
  );
