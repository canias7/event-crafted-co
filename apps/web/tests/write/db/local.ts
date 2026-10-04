import crypto from "node:crypto";

// Isolated local Supabase stack (started by write-flow-tests.yml with
// `supabase start`). These values come from `supabase status -o env` on the
// runner; there are no production credentials anywhere in this suite.
export const LOCAL_URL = process.env.LOCAL_SUPABASE_URL || "";
export const LOCAL_ANON = process.env.LOCAL_ANON_KEY || "";
export const LOCAL_SERVICE = process.env.LOCAL_SERVICE_ROLE_KEY || "";
export const LOCAL_READY = Boolean(LOCAL_URL && LOCAL_ANON && LOCAL_SERVICE);

// Never let this suite talk to anything but localhost.
if (LOCAL_URL && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(LOCAL_URL)) {
  throw new Error("write tests refuse to run against a non-local Supabase URL");
}

export const LOCAL_BLOCKED_REASON =
  process.env.LOCAL_BLOCKED_REASON ||
  "BLOCKED: no isolated local Supabase stack (LOCAL_SUPABASE_URL unset) — see the migration-replay result";

type Json = Record<string, unknown>;

async function call(method: string, path: string, key: string, token: string, body?: unknown, prefer?: string) {
  const res = await fetch(`${LOCAL_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

// ---- privileged fixture setup (isolated stack only) ----
export const admin = {
  rest: (method: string, path: string, body?: unknown) =>
    call(method, `/rest/v1/${path}`, LOCAL_SERVICE, LOCAL_SERVICE, body, "return=representation"),
  async createUser(prefix: string) {
    const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@canary.local.test`;
    const password = crypto.randomBytes(18).toString("base64url");
    const r = await call("POST", "/auth/v1/admin/users", LOCAL_SERVICE, LOCAL_SERVICE, {
      email,
      password,
      email_confirm: true,
    });
    if (r.status >= 300) throw new Error(`createUser ${r.status}`);
    return { id: (r.data as Json).id as string, email, password };
  },
};

// ---- ordinary user sessions (what every assertion runs as) ----
export interface LocalUser {
  id: string;
  token: string;
}

export async function signIn(email: string, password: string): Promise<LocalUser> {
  const r = await call("POST", "/auth/v1/token?grant_type=password", LOCAL_ANON, LOCAL_ANON, { email, password });
  if (r.status !== 200) throw new Error(`local sign-in ${r.status}`);
  const d = r.data as Json;
  return { id: (d.user as Json).id as string, token: d.access_token as string };
}

export const as = (u: LocalUser) => ({
  get: (path: string) => call("GET", `/rest/v1/${path}`, LOCAL_ANON, u.token),
  post: (path: string, body: unknown) => call("POST", `/rest/v1/${path}`, LOCAL_ANON, u.token, body, "return=representation"),
  patch: (path: string, body: unknown) => call("PATCH", `/rest/v1/${path}`, LOCAL_ANON, u.token, body, "return=representation"),
  del: (path: string) => call("DELETE", `/rest/v1/${path}`, LOCAL_ANON, u.token, undefined, "return=representation"),
});

// A vendor (approved listing, owner = team admin) and a host, synthetic.
export async function seedVendor(label: string) {
  const u = await admin.createUser(`vendor-${label}`);
  await admin.rest("POST", "profiles?on_conflict=id", { id: u.id, role: "vendor", application_status: "approved" });
  await admin.rest("PATCH", `profiles?id=eq.${u.id}`, { role: "vendor", application_status: "approved" });
  const vp = await admin.rest("POST", "vendor_profiles", {
    user_id: u.id,
    business_name: `Canary Vendor ${label}`,
    category: "photography",
    application_status: "pending",
  });
  if (vp.status >= 300) throw new Error(`seed vendor_profiles ${vp.status}: ${JSON.stringify(vp.data).slice(0, 200)}`);
  const listingId = (vp.data as Json[])[0].id as string;
  // A listing can't go live with fewer than 3 photos (enforce_listing_min_photos),
  // so add synthetic portfolio rows first, then approve — the real path.
  const photos = await admin.rest(
    "POST",
    "vendor_portfolio_images",
    [0, 1, 2].map((i) => ({ vendor_id: listingId, storage_path: `${listingId}/canary-${i}.jpg`, display_order: i })),
  );
  if (photos.status >= 300) throw new Error(`seed portfolio ${photos.status}: ${JSON.stringify(photos.data).slice(0, 200)}`);
  const approve = await admin.rest("PATCH", `vendor_profiles?id=eq.${listingId}`, { application_status: "approved" });
  if (approve.status >= 300) throw new Error(`approve listing ${approve.status}: ${JSON.stringify(approve.data).slice(0, 200)}`);
  // Owners are team admins in this schema; make it explicit for the fixture.
  await admin.rest("POST", "vendor_team_members", { vendor_id: listingId, user_id: u.id, role: "admin" });
  return { ...u, listingId, session: await signIn(u.email, u.password) };
}

export async function seedHost(label: string) {
  const u = await admin.createUser(`host-${label}`);
  await admin.rest("POST", "profiles?on_conflict=id", { id: u.id, role: "host" });
  return { ...u, session: await signIn(u.email, u.password) };
}
