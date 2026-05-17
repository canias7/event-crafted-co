-- vendor_team_bios retired. Web stopped consuming it weeks ago; the
-- mobile apps (vendor-mobile, host-mobile) have now been carved out
-- in the same change. CASCADE drops the 4 RLS policies + the
-- vendor_id → vendor_profiles FK. The table was empty at drop time.

drop table if exists public.vendor_team_bios cascade;
