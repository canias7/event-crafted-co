// Vendor setup checklist for vendor-mobile.
//
// The logic lives in @vendora/core so the app and the website compute
// "how far is this vendor from being discoverable?" identically. This
// module only binds it to this app's Supabase client.

import { loadSetupState as loadSetupStateCore } from "@vendora/core";
import { supabase } from "./supabase";

export type { SetupItem, SetupRoute, SetupState } from "@vendora/core";

export function loadSetupState(userId: string) {
  return loadSetupStateCore(supabase, userId);
}
