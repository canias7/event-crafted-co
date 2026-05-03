-- Admin role gets cross-user read + targeted write capabilities for
-- moderation and verification workflows.

-- Helper: is the caller an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;

grant execute on function public.is_admin() to authenticated;

-- Read-anywhere policies for admin
create policy "profiles admin select"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "inquiries admin select"
  on public.inquiries for select
  to authenticated
  using (public.is_admin());

create policy "messages admin select"
  on public.messages for select
  to authenticated
  using (public.is_admin());

create policy "reviews admin select"
  on public.reviews for select
  to authenticated
  using (public.is_admin());

-- Admin verify / unverify a vendor (sets verified_at)
create policy "vendor_profiles admin update"
  on public.vendor_profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
