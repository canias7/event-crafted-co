-- is_vendor_owner and is_vendor_member are byte-identical SQL
-- functions; both check vendor_team_members for the calling user.
-- inquiries RLS uses is_vendor_owner, everything else uses
-- is_vendor_member. "Owner" implies more than membership and is
-- misleading. Consolidate on is_vendor_member.

alter policy "inquiries vendor select" on public.inquiries
  using (public.is_vendor_member(vendor_id));

alter policy "inquiries vendor update" on public.inquiries
  using (public.is_vendor_member(vendor_id));

drop function if exists public.is_vendor_owner(uuid);
