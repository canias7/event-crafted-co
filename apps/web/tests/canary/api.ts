import fs from "node:fs";
import { sessionFromStorageState } from "../e2e/session";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { CANARY_HOST_STATE, CANARY_VENDOR_STATE } from "./paths";

// Read-only PostgREST access as an ordinary user (or anon). No service role
// here: authorization is always tested with the user's own token.

export interface Actor {
  token: string;
  uid: string;
}

function actorFrom(file: string): Actor {
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  const a = sessionFromStorageState(state);
  if (!a) throw new Error(`no seeded session in ${file.split("/").pop()} — did the setup project run?`);
  return a;
}

export const vendorActor = () => actorFrom(CANARY_VENDOR_STATE);
export const hostActor = () => actorFrom(CANARY_HOST_STATE);

export async function rest<T = Record<string, unknown>>(
  path: string,
  token?: string,
): Promise<{ rows: T[]; count: number | null; status: number }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      prefer: "count=exact",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    // Don't echo the body: an error can include row data.
    throw new Error(`GET ${path.split("?")[0]} → ${res.status}`);
  }
  const range = res.headers.get("content-range"); // e.g. "0-24/68" or "*/0"
  const total = range?.split("/")[1];
  return {
    rows: (await res.json()) as T[],
    count: total && total !== "*" ? Number(total) : null,
    status: res.status,
  };
}

export async function rpc<T = unknown>(fn: string, token: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rpc ${fn} → ${res.status}`);
  return res.json();
}

// The vendor ids a vendor's dashboard aggregates: listings they own plus
// listings they're a team member of (mirrors useVendorAccess / the inbox).
export async function accessibleVendorIds(a: Actor): Promise<string[]> {
  const own = await rest<{ id: string }>(`vendor_profiles?select=id&user_id=eq.${a.uid}`, a.token);
  const team = await rest<{ vendor_id: string }>(
    `vendor_team_members?select=vendor_id&user_id=eq.${a.uid}`,
    a.token,
  );
  return [...new Set([...own.rows.map((r) => r.id), ...team.rows.map((r) => r.vendor_id)])];
}
