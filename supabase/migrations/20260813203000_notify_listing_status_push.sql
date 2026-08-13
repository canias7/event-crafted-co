-- Push + in-app notification when an admin decides a listing.
-- Approve/reject already emails the vendor (send-transactional-email
-- from the admin panel); this adds the phone buzz. Inserting into
-- public.notifications is all it takes — fanout_notification_to_push()
-- delivers to every device in device_push_tokens automatically.
--
-- A DB trigger (not an admin-client call) so every present and future
-- admin surface gets it for free, and so it can't be forgotten.
create or replace function public.notify_listing_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.application_status in ('approved', 'rejected')
     and old.application_status is distinct from new.application_status then
    v_name := coalesce(nullif(trim(new.business_name), ''), 'Your listing');
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.user_id,
      'listing_status',
      case when new.application_status = 'approved'
        then v_name || ' is live! 🎉'
        else v_name || ' needs changes' end,
      case when new.application_status = 'approved'
        then 'Your listing was approved — hosts can now find and book you on Vendora.'
        else 'Your listing wasn''t approved this time. Open the app to review and re-submit.' end,
      '/vendor/listing-status'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_listing_status on public.vendor_profiles;
create trigger trg_notify_listing_status
  after update of application_status on public.vendor_profiles
  for each row execute function public.notify_listing_status();
