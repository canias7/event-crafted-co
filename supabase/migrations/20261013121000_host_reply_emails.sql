-- Email hosts when a vendor replies (owner's call, Oct 2026).
--
-- On by default; a host turns it off with notification_prefs.reply_email
-- = false (Settings -> Notifications on the website, Account settings in
-- the host app). A missing key counts as on.
--
-- scan-host-reply-emails runs every 5 minutes and calls
-- claim_host_reply_emails(), which picks vendor messages that:
--   * are 10-60 minutes old (gives the host time to read it live),
--   * the host hasn't read (inquiries.host_read_at is older),
--   * aren't deleted, aren't in a thread the host muted,
--   * haven't been emailed yet,
-- stamps them host_emailed_at and returns one row per thread with the
-- latest message, so a burst of messages becomes one email.

alter table public.direct_messages
  add column if not exists host_emailed_at timestamptz;

create or replace function public.claim_host_reply_emails()
returns table (
  thread_id uuid,
  inquiry_id uuid,
  host_id uuid,
  email text,
  vendor_name text,
  message_count integer,
  latest_body text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return query
  with picked as (
    update public.direct_messages dm
       set host_emailed_at = now()
      from public.direct_threads t
      left join public.inquiries i on i.id = t.inquiry_id
      join public.profiles p on p.id = t.host_id
     where dm.thread_id = t.id
       and dm.sender_role <> 'host'
       and dm.deleted_at is null
       and dm.host_emailed_at is null
       and dm.created_at < now() - interval '10 minutes'
       and dm.created_at > now() - interval '60 minutes'
       and (i.host_read_at is null or i.host_read_at < dm.created_at)
       and coalesce((p.notification_prefs ->> 'reply_email')::boolean, true)
       and not exists (
         select 1 from public.thread_mutes mut
          where mut.user_id = t.host_id and mut.thread_id = t.id
       )
    returning dm.thread_id, dm.body, dm.created_at
  ),
  per_thread as (
    select pk.thread_id,
           count(*)::integer as message_count,
           (array_agg(pk.body order by pk.created_at desc))[1] as latest_body
      from picked pk
     group by pk.thread_id
  )
  select pt.thread_id,
         t.inquiry_id,
         t.host_id,
         u.email::text,
         vp.business_name,
         pt.message_count,
         pt.latest_body
    from per_thread pt
    join public.direct_threads t on t.id = pt.thread_id
    join auth.users u on u.id = t.host_id
    left join public.vendor_profiles vp on vp.id = t.vendor_id;
end
$$;

revoke execute on function public.claim_host_reply_emails()
  from public, anon, authenticated;
grant execute on function public.claim_host_reply_emails() to service_role;

select cron.schedule(
  'scan-host-reply-emails',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-host-reply-emails',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
      ),
      body := '{}'::jsonb
    );
  $$
);
