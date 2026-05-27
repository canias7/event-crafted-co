-- Tighten vendor_contractors SELECT to team admins only.
--
-- The original policy (PR #986) used is_vendor_member for SELECT,
-- which means a non-admin member-role teammate (e.g. a virtual
-- assistant handling email) could read every contractor's
-- name + address + phone + email + tax_id_last4 for the vendor's
-- account. That's TIN-adjacent data that should be admin-only —
-- matching the WRITE policies, which already gate to
-- is_vendor_team_admin.
--
-- Trade-off: members CAN still see vendor_expenses rows (including
-- contractor_id FK), so they know SOME labor expense exists for a
-- contractor — they just can't read the contractor's PII. If we
-- later need members to render contractor NAMES on expense rows,
-- a member-safe view (name + id only, no tax_id/address) is the
-- right pattern, not relaxing this policy.

drop policy if exists vendor_contractors_select on public.vendor_contractors;

create policy vendor_contractors_select
  on public.vendor_contractors for select
  using (public.is_vendor_team_admin(vendor_id));
