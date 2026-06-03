-- Lock contract e-signing to the host the contract was sent to. Previously
-- anyone with the sign link (including the vendor) could request a code to any
-- email and sign. Now the OTP is bound to the contract's recipient, looked up
-- server-side, so only someone with access to that inbox can sign.

-- 1) On insert, pull the recipient's email from auth.users via the inquiry.
--    The vendor can't read host emails directly (RLS), so this runs SECURITY
--    DEFINER. Once set, signing is locked to that address.
create or replace function public.tg_set_contract_recipient_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(btrim(new.recipient_email), '') = '' and new.inquiry_id is not null then
    select lower(btrim(u.email)) into new.recipient_email
    from public.inquiries i
    join auth.users u on u.id = i.host_id
    where i.id = new.inquiry_id;
  elsif new.recipient_email is not null then
    new.recipient_email := lower(btrim(new.recipient_email));
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_set_contract_recipient_email on public.vendor_contracts;
create trigger trg_set_contract_recipient_email
before insert on public.vendor_contracts
for each row execute function public.tg_set_contract_recipient_email();

-- 2) Expose a masked recipient + a fixed-recipient flag so the signing page can
--    show "code goes to j•••@x.com" without leaking the full address.
drop function if exists public.get_contract_for_signing(text);
create function public.get_contract_for_signing(p_token text)
returns table(
  id uuid, title text, body text, status text, recipient_name text,
  signer_name text, signed_at timestamptz, vendor_business_name text,
  signature_image text, recipient_email_masked text, has_fixed_recipient boolean
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select c.id, c.title, c.body, c.status, c.recipient_name,
         c.signer_name, c.signed_at, vp.business_name, c.signature_image,
         case
           when coalesce(btrim(c.recipient_email), '') = '' then null
           else left(c.recipient_email, 1) || '•••@' || split_part(c.recipient_email, '@', 2)
         end as recipient_email_masked,
         coalesce(btrim(c.recipient_email), '') <> '' as has_fixed_recipient
  from public.vendor_contracts c
  join public.vendor_profiles vp on vp.id = c.vendor_id
  where c.sign_token = p_token
  limit 1;
$function$;

-- 3) When a contract has a fixed recipient, the OTP lookup is locked to that
--    address — the signer's submitted p_email is ignored. Falls back to the
--    submitted email only for legacy contracts with no recipient on file.
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

  v_email := lower(btrim(coalesce(nullif(btrim(v_recipient), ''), p_email)));
  if coalesce(v_email, '') = '' or coalesce(btrim(p_otp), '') = '' then
    raise exception 'email_verification_required';
  end if;
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

-- 4) Backfill existing contracts that predate the trigger.
update public.vendor_contracts c
set recipient_email = lower(btrim(u.email))
from public.inquiries i
join auth.users u on u.id = i.host_id
where c.inquiry_id = i.id
  and coalesce(btrim(c.recipient_email), '') = '';
