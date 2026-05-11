-- Mobile push token registry. Each row = one device on which the user
-- granted notification permission. Populated by the mobile apps via
-- tryRegisterPushToken (lib/pushNotifications.ts) after sign-in.
--
-- The Expo push token is unique per device install, so we use it as
-- the primary key and let upserts collide on it (so re-installing
-- doesn't pile up dead tokens). Dead tokens get purged by the
-- send-push edge function when Expo returns DeviceNotRegistered.

create table if not exists public.device_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  app text not null check (app in ('vendor', 'host')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_idx
  on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

drop policy if exists "device_push_tokens own select" on public.device_push_tokens;
create policy "device_push_tokens own select"
  on public.device_push_tokens for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "device_push_tokens own insert" on public.device_push_tokens;
create policy "device_push_tokens own insert"
  on public.device_push_tokens for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "device_push_tokens own update" on public.device_push_tokens;
create policy "device_push_tokens own update"
  on public.device_push_tokens for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "device_push_tokens own delete" on public.device_push_tokens;
create policy "device_push_tokens own delete"
  on public.device_push_tokens for delete to authenticated
  using (auth.uid() = user_id);
