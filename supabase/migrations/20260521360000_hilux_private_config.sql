-- Move hilux_instructions + hilux_voice_samples off `profiles` into a
-- vendor-private table. These columns held the vendor's HIGH-sensitivity
-- agent config (custom system instructions, voice samples used for
-- mimicry). The existing "profiles visible to inquiry/thread counterparts"
-- RLS policy made the whole profile row visible to any host who had
-- ever inquired — so a host could read the vendor's secret HILUX
-- instructions just by querying their profile.
--
-- Postgres RLS is row-level (not column-level), so the fix is to move
-- these columns into their own table with owner-only RLS.

create table public.hilux_private_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hilux_instructions text,
  hilux_voice_samples text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

-- Backfill from existing profile rows. Only rows with non-empty
-- private config; defaults are fine for the rest.
insert into public.hilux_private_config (user_id, hilux_instructions, hilux_voice_samples)
select
  id,
  hilux_instructions,
  coalesce(hilux_voice_samples, '{}'::text[])
from public.profiles
where hilux_instructions is not null
   or coalesce(array_length(hilux_voice_samples, 1), 0) > 0;

-- Drop the columns from profiles now that the data is migrated.
alter table public.profiles drop column hilux_instructions;
alter table public.profiles drop column hilux_voice_samples;

alter table public.hilux_private_config enable row level security;

create policy "hilux_private_config select own"
  on public.hilux_private_config for select to authenticated
  using (user_id = auth.uid());

create policy "hilux_private_config insert own"
  on public.hilux_private_config for insert to authenticated
  with check (user_id = auth.uid());

create policy "hilux_private_config update own"
  on public.hilux_private_config for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "hilux_private_config delete own"
  on public.hilux_private_config for delete to authenticated
  using (user_id = auth.uid());
