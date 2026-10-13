-- Account deletion gets a 30-day grace period (owner's call, Oct 2026).
--
-- Before: request_account_deletion() deleted auth.users straight away.
-- Now it closes the account and schedules the deletion:
--   * profiles.deletion_scheduled_for = now() + 30 days (null = active).
--     Asking again keeps the first date.
--   * every live listing the user owns is paused (vendor_profiles.paused_at)
--     and flagged paused_for_deletion, so restoring un-pauses only those
--     and leaves listings the vendor had paused themselves alone.
-- Signing in during the grace period shows a "scheduled for deletion"
-- screen (website and both apps) with Restore / Sign out. Restore calls
-- restore_account_deletion().
--
-- The purge-deleted-accounts edge function runs daily from pg_cron. It
-- asks account_deletions_pending() for the accounts that are due (and for
-- scheduled accounts that still hold a Stripe subscription, e.g. scheduled
-- from an old app build that called this RPC without the delete-account
-- function), cancels any live Stripe subscription, removes the user's
-- files (account_storage_objects()) through the Storage API, and deletes
-- the auth user so the rows cascade as they did before.
--
-- The delete-account edge function still cancels Stripe first and then
-- calls request_account_deletion() as the user.

alter table public.profiles
  add column if not exists deletion_scheduled_for timestamptz;

comment on column public.profiles.deletion_scheduled_for is
  'When the user asked to delete the account: the date it is purged. Null = active. Set by request_account_deletion(), cleared by restore_account_deletion().';

alter table public.vendor_profiles
  add column if not exists paused_for_deletion boolean not null default false;

comment on column public.vendor_profiles.paused_for_deletion is
  'True when request_account_deletion() paused this listing; restore_account_deletion() un-pauses only these.';

create index if not exists profiles_deletion_scheduled_for_idx
  on public.profiles (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

-- The return type changes (void -> timestamptz), which create or replace
-- can't do. Old app builds that call the RPC ignore the result.
drop function if exists public.request_account_deletion();

create function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_when timestamptz;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  update public.profiles
     set deletion_scheduled_for =
           coalesce(deletion_scheduled_for, now() + interval '30 days')
   where id = v_uid
  returning deletion_scheduled_for into v_when;

  if v_when is null then
    -- No profile row (shouldn't happen): nothing to schedule against, so
    -- fall back to the old immediate deletion.
    delete from auth.users where id = v_uid;
    return now();
  end if;

  update public.vendor_profiles
     set paused_at = now(),
         paused_for_deletion = true
   where user_id = v_uid
     and paused_at is null;

  return v_when;
end
$function$;

revoke execute on function public.request_account_deletion()
  from public, anon, service_role;
grant execute on function public.request_account_deletion() to authenticated;

create or replace function public.restore_account_deletion()
returns void
language plpgsql
security definer
set search_path = public, auth
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  update public.profiles
     set deletion_scheduled_for = null
   where id = v_uid
     and deletion_scheduled_for is not null;

  update public.vendor_profiles
     set paused_at = null,
         paused_for_deletion = false
   where user_id = v_uid
     and paused_for_deletion;
end
$function$;

revoke execute on function public.restore_account_deletion()
  from public, anon, service_role;
grant execute on function public.restore_account_deletion() to authenticated;

-- For purge-deleted-accounts (service role only). due = the grace period
-- is over and the account should be purged now. Not-yet-due rows are
-- returned only while they still carry a Stripe subscription, so the job
-- can cancel it defensively.
create or replace function public.account_deletions_pending()
returns table (
  user_id uuid,
  deletion_scheduled_for timestamptz,
  due boolean,
  stripe_customer_id text,
  stripe_subscription_id text
)
language sql
stable
security definer
set search_path = public
as $function$
  select p.id,
         p.deletion_scheduled_for,
         p.deletion_scheduled_for < now(),
         p.stripe_customer_id::text,
         p.stripe_subscription_id::text
    from public.profiles p
   where p.deletion_scheduled_for is not null
     and (p.deletion_scheduled_for < now()
          or p.stripe_subscription_id is not null)
   order by p.deletion_scheduled_for;
$function$;

revoke execute on function public.account_deletions_pending()
  from public, anon, authenticated;
grant execute on function public.account_deletions_pending() to service_role;

-- The user's files, for purge-deleted-accounts (service role only).
-- A file belongs to the user when, in one of the user-content buckets,
-- it was uploaded by them (owner_id) or sits under a folder named after
-- their user id or one of their listings (vendor_profiles.id):
--   user id:    vendor-gallery, vendor-posts / vendor-reels (logo, avatar,
--               team photos, posts, reels), vendor-verifications (ID
--               scans), review-photos, message-attachments (partner chat)
--   listing id: vendor-portfolios, vendor-showcase-clips,
--               vendor-verifications (older uploads)
--   uploader:   message-attachments under an inquiry id
-- Other buckets (editorial-images, ai-site-images) are never touched.
-- Returns at most p_limit rows; the caller removes them and asks again.
create or replace function public.account_storage_objects(
  p_user_id uuid,
  p_limit integer default 1000
)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = public, storage
as $function$
  with prefixes as (
    select p_user_id::text as prefix
    union
    select v.id::text from public.vendor_profiles v where v.user_id = p_user_id
  )
  select o.bucket_id, o.name
    from storage.objects o
   where o.bucket_id in (
           'vendor-gallery', 'vendor-portfolios', 'vendor-posts',
           'vendor-reels', 'vendor-logos', 'vendor-showcase-clips',
           'message-attachments', 'review-photos', 'vendor-verifications'
         )
     and (
           o.owner_id = p_user_id::text
           or split_part(o.name, '/', 1) in (select prefix from prefixes)
         )
   order by o.bucket_id, o.name
   limit greatest(coalesce(p_limit, 1000), 1);
$function$;

revoke execute on function public.account_storage_objects(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.account_storage_objects(uuid, integer)
  to service_role;

-- Daily purge (04:17 UTC). cron.schedule replaces a job of the same name.
select cron.schedule(
  'purge-deleted-accounts',
  '17 4 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/purge-deleted-accounts',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
      ),
      body := '{}'::jsonb
    );
  $$
);
