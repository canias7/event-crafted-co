-- Claim links never opened: get_claim_invitation_by_token selected five
-- columns positionally into a whole vendor_profiles row, so business_name
-- landed in the uuid user_id field and every call failed with 22P02
-- ("invalid input syntax for type uuid"). The page then showed "Link not
-- found". Read the row whole instead; the returned JSON is unchanged.
create or replace function public.get_claim_invitation_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  invite_row public.vendor_claim_invitations;
  vendor_row public.vendor_profiles;
begin
  select * into invite_row from public.vendor_claim_invitations where token = p_token;
  if invite_row.id is null then
    return null;
  end if;
  select * into vendor_row from public.vendor_profiles where id = invite_row.vendor_id;
  return jsonb_build_object(
    'invite', jsonb_build_object('email', invite_row.email, 'status', invite_row.status, 'created_at', invite_row.created_at),
    'vendor', jsonb_build_object(
      'id', vendor_row.id,
      'business_name', vendor_row.business_name,
      'category', vendor_row.category,
      'location', vendor_row.location,
      'already_owned', vendor_row.user_id is not null
    )
  );
end
$function$;
