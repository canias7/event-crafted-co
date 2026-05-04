// Admin-only bulk vendor import. Takes an array of vendor rows
// (validated client-side from CSV) and for each row:
//   1. Sends a Supabase invite email to the address (creates auth.user
//      in invited state — the vendor confirms via email link).
//   2. Creates a profiles row with role='vendor' (handle_new_user
//      trigger usually does this; we upsert defensively).
//   3. Creates a vendor_profiles skeleton with the supplied fields so
//      the marketplace surfaces the vendor immediately even before the
//      vendor signs in to finish their profile.
//
// Returns per-row result so the admin sees exactly which rows imported
// vs which failed (duplicate email, invalid category, etc).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendora.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImportRow {
  email: string;
  business_name: string;
  category: string;
  location?: string;
  base_price_cents?: number;
  bio?: string;
}

interface RowResult {
  email: string;
  ok: boolean;
  vendor_id?: string;
  reason?: string;
  status?: "invited" | "existing";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !SUPABASE_ANON_KEY
  ) {
    return json({ error: "Supabase env not configured" }, 500);
  }

  // Verify caller is admin via the user's bearer JWT.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: meRes, error: meErr } = await userClient.auth.getUser();
  if (meErr || !meRes.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", meRes.user.id);
  const isAdmin = ((roleRows as Array<{ role: string }> | null) ?? []).some(
    (r) => r.role === "admin",
  );
  if (!isAdmin) return json({ error: "admin only" }, 403);

  let body: { rows?: ImportRow[] } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const rows = body.rows ?? [];
  if (rows.length === 0) return json({ error: "no rows" }, 400);
  if (rows.length > 200) {
    return json({ error: "max 200 rows per import" }, 400);
  }

  const results: RowResult[] = [];

  for (const row of rows) {
    const r = await importOne(admin, row);
    results.push(r);
  }

  return json(
    {
      total: rows.length,
      succeeded: results.filter((r) => r.ok).length,
      results,
    },
    200,
  );
});

async function importOne(admin: any, row: ImportRow): Promise<RowResult> {
  if (!row.email || !row.business_name || !row.category) {
    return {
      email: row.email ?? "",
      ok: false,
      reason: "email + business_name + category required",
    };
  }

  // 1. Invite or look up the user.
  let userId: string | null = null;
  let status: "invited" | "existing" = "invited";

  const { data: existing } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  // listUsers without filter is paginated — search by email via the
  // dedicated lookup endpoint instead.
  const { data: byEmail } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", row.email)
    .maybeSingle();
  if ((byEmail as any)?.id) {
    userId = (byEmail as any).id;
    status = "existing";
  } else {
    const inv = await admin.auth.admin.inviteUserByEmail(row.email, {
      redirectTo: `${APP_URL}/vendor/profile`,
    });
    if (inv.error) {
      return { email: row.email, ok: false, reason: inv.error.message };
    }
    userId = inv.data?.user?.id ?? null;
  }
  if (!userId) {
    return { email: row.email, ok: false, reason: "user creation returned no id" };
  }

  // 2. Make sure profile row exists with role='vendor'.
  await admin.from("profiles").upsert(
    {
      id: userId,
      role: "vendor",
      display_name: row.business_name,
    },
    { onConflict: "id" },
  );
  await admin.from("user_roles").upsert(
    {
      user_id: userId,
      role: "vendor",
    },
    { onConflict: "user_id,role", ignoreDuplicates: true },
  );

  // 3. Create the vendor profile (or skip if it already exists).
  const { data: existingVp } = await admin
    .from("vendor_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if ((existingVp as any)?.id) {
    return { email: row.email, ok: true, vendor_id: (existingVp as any).id, status };
  }

  const { data: created, error: vpErr } = await admin
    .from("vendor_profiles")
    .insert({
      user_id: userId,
      business_name: row.business_name,
      category: row.category,
      location: row.location ?? null,
      base_price_cents: row.base_price_cents ?? null,
      bio: row.bio ?? null,
    })
    .select("id")
    .single();
  if (vpErr) {
    return { email: row.email, ok: false, reason: `vendor_profiles: ${vpErr.message}` };
  }

  return { email: row.email, ok: true, vendor_id: (created as any).id, status };
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
