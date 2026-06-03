-- Create a standalone "sent" contract bound to a vendor-chosen recipient email
-- (the Workspace → Contracts "Send to email" flow, which isn't tied to an
-- inquiry). recipient_email is column-locked from clients to stop a vendor
-- re-pointing an inquiry contract at their own inbox; this RPC is the sanctioned
-- path for vendor-initiated sends. It deliberately does NOT accept inquiry_id —
-- inquiry-bound contracts keep getting their recipient from the host via the
-- insert trigger, so the host-binding protection is untouched.
create or replace function public.create_sent_contract(
  p_vendor_id uuid,
  p_title text,
  p_body text,
  p_recipient_name text default null,
  p_recipient_email text default null,
  p_template_id uuid default null
)
returns text
language plpgsql security definer set search_path to 'public'
as $function$
declare v_token text; v_email text;
begin
  if not public.is_vendor_member(p_vendor_id) then
    raise exception 'not_authorized';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'title_and_body_required';
  end if;
  v_email := nullif(lower(btrim(coalesce(p_recipient_email, ''))), '');
  if v_email is null then
    raise exception 'recipient_email_required';
  end if;
  insert into public.vendor_contracts
    (vendor_id, template_id, title, body, recipient_name, recipient_email)
  values
    (p_vendor_id, p_template_id, btrim(p_title), p_body,
     nullif(btrim(coalesce(p_recipient_name, '')), ''), v_email)
  returning sign_token into v_token;
  return v_token;
end;
$function$;

grant execute on function public.create_sent_contract(uuid, text, text, text, text, uuid)
  to authenticated;
