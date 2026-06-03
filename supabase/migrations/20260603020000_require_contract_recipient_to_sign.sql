-- Close the no-recipient fallback. Previously a contract with no bound
-- recipient (e.g. created without an inquiry) fell back to a signer-supplied
-- email, which anyone with the link could set. Now signing is locked to the
-- bound recipient_email; a contract with none on file is simply not signable.
-- The p_email argument is kept for signature compatibility but ignored.
create or replace function public.sign_contract(
  p_token text, p_signer_name text, p_signature_image text default null,
  p_email text default null, p_otp text default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid; v_status text; v_vendor uuid; v_inquiry uuid; v_title text;
  v_recipient text; v_email text; v_otp record;
begin
  select id, status, vendor_id, inquiry_id, title, recipient_email
    into v_id, v_status, v_vendor, v_inquiry, v_title, v_recipient
    from public.vendor_contracts where sign_token = p_token for update;
  if v_id is null then raise exception 'contract_not_found'; end if;
  if v_status <> 'sent' then return v_status; end if;
  if coalesce(btrim(p_signer_name), '') = '' then raise exception 'signer_name_required'; end if;

  -- Signing is locked to the bound recipient. No recipient on file => not signable.
  v_email := lower(btrim(coalesce(v_recipient, '')));
  if v_email = '' then raise exception 'contract_has_no_recipient'; end if;
  if coalesce(btrim(p_otp), '') = '' then raise exception 'email_verification_required'; end if;
  if p_signature_image is not null and length(p_signature_image) > 200000 then
    raise exception 'signature_too_large';
  end if;

  select * into v_otp from public.contract_sign_otps
    where contract_id = v_id and lower(email) = v_email and expires_at > now()
    order by created_at desc limit 1 for update;
  if v_otp.id is null then return 'code_expired_or_missing'; end if;
  if v_otp.attempts >= 5 then return 'too_many_attempts'; end if;
  if v_otp.code_hash <> encode(extensions.digest(btrim(p_otp), 'sha256'), 'hex') then
    update public.contract_sign_otps set attempts = attempts + 1 where id = v_otp.id;
    return 'invalid_code';
  end if;

  update public.vendor_contracts
    set status = 'signed', signer_name = btrim(p_signer_name),
        signature_image = p_signature_image, verified_email = v_email,
        signed_at = now(), signer_user_id = (select auth.uid())
    where id = v_id;
  delete from public.contract_sign_otps where contract_id = v_id;
  insert into public.notifications (user_id, type, title, body, link)
  select m.user_id, 'contract_signed',
    btrim(p_signer_name) || ' signed "' || v_title || '"',
    'Your contract has been signed.',
    coalesce('/vendor/inbox/' || v_inquiry::text, '/vendor/workspace?tab=files')
  from public.vendor_team_members m where m.vendor_id = v_vendor;
  return 'signed';
end;
$function$;
