-- When a proposal flips to accepted, email the vendor (in addition to the
-- in-app notification + push). Mirrors the notifications push fan-out:
-- best-effort net.http_post, never blocks the accept.
create or replace function public.fanout_proposal_accepted_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_url constant text := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/proposal-accepted-email';
begin
  if new.status = 'accepted' and coalesce(old.status, '') <> 'accepted' then
    begin
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('proposal_id', new.id)
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_proposal_accepted_email on public.vendor_proposals;
create trigger trg_proposal_accepted_email
after update on public.vendor_proposals
for each row execute function public.fanout_proposal_accepted_email();
