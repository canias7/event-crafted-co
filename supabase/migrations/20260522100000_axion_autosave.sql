-- Axion setting: when on, images Axion generates are saved to the
-- vendor's gallery automatically after each run (no manual save).

alter table public.profiles
  add column if not exists axion_autosave boolean not null default false;
