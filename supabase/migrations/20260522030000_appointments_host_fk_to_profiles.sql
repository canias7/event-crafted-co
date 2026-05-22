-- appointments.host_id was FK'd straight to auth.users(id), unlike the
-- sibling inquiries table whose host_id points at public.profiles(id).
-- With no FK between appointments and profiles, PostgREST can't resolve
-- the host-name embed the vendor appointments page asks for
-- (host:profiles!appointments_host_id_fkey(display_name)) and the
-- request 400s.
--
-- Re-point the FK at public.profiles(id) to match inquiries. profiles.id
-- is itself FK'd to auth.users(id) on delete cascade, so a deleted user
-- still cascades through to their appointments — behavior is unchanged.

alter table public.appointments
  drop constraint appointments_host_id_fkey,
  add constraint appointments_host_id_fkey
    foreign key (host_id) references public.profiles (id) on delete cascade;

notify pgrst, 'reload schema';
