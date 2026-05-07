import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.local.example to .env.local and fill in.",
  );
}

export const supabase = createClient(url, key, {
  auth: {
    storage: localStorage,
    storageKey: "vendora-admin-auth",
    persistSession: true,
    autoRefreshToken: true,
  },
});
