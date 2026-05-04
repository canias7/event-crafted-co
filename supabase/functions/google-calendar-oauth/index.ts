// google-calendar-oauth: handles the 3-step OAuth flow for connecting a
// user's Google Calendar to Vendora. Three actions on the same endpoint
// (separated by ?action=):
//
//   ?action=authorize  → POST  → returns { url } the client redirects to
//   ?action=callback   → GET   → Google redirects here after consent;
//                                we exchange the code for tokens, store
//                                the row, then redirect to /settings.
//   ?action=disconnect → POST  → revokes + deletes the user's row
//
// State token is a base64url-encoded JSON payload signed with HMAC-SHA256
// using GOOGLE_OAUTH_STATE_SECRET. Self-contained — no temp DB row.
//
// Required Supabase secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
// GOOGLE_OAUTH_STATE_SECRET, APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
const STATE_SECRET = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET");
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendora.app";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !SUPABASE_ANON_KEY ||
    !CLIENT_ID ||
    !CLIENT_SECRET ||
    !STATE_SECRET
  ) {
    return text(
      "Calendar sync isn't configured. See migration 20260503490000_calendar_sync.sql for setup.",
      500,
    );
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-oauth?action=callback`;

  try {
    if (action === "authorize" && req.method === "POST") {
      return await handleAuthorize(req, redirectUri);
    }
    if (action === "callback" && req.method === "GET") {
      return await handleCallback(url, redirectUri);
    }
    if (action === "disconnect" && req.method === "POST") {
      return await handleDisconnect(req);
    }
    return json({ error: "unknown action" }, 400);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

async function handleAuthorize(req: Request, redirectUri: string) {
  const userId = await userIdFromAuth(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  const state = await signState({
    user_id: userId,
    nonce: crypto.randomUUID(),
    exp: Date.now() + 10 * 60 * 1000, // 10 min
  });

  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return json({ url: authUrl }, 200);
}

async function handleCallback(url: URL, redirectUri: string) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return redirect(
      `${APP_URL}/settings?calendar=error&reason=${encodeURIComponent(errorParam)}`,
    );
  }
  if (!code || !state) {
    return redirect(`${APP_URL}/settings?calendar=error&reason=missing`);
  }

  const verified = await verifyState(state);
  if (!verified) {
    return redirect(`${APP_URL}/settings?calendar=error&reason=state`);
  }

  // Exchange code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    console.error("token exchange failed", tokenRes.status, t);
    return redirect(`${APP_URL}/settings?calendar=error&reason=token`);
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };

  // Fetch the user's email so we can show "Connected as foo@gmail.com".
  let accountEmail: string | null = null;
  try {
    const me = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    if (me.ok) {
      const data = (await me.json()) as { email?: string };
      accountEmail = data.email ?? null;
    }
  } catch {
    // best-effort
  }

  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const expiresAt = new Date(
    Date.now() + (tokens.expires_in - 60) * 1000,
  ).toISOString();

  // Upsert: reconnect overwrites.
  const { error } = await sb.from("calendar_connections").upsert(
    {
      user_id: verified.user_id,
      provider: "google",
      account_email: accountEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: expiresAt,
      pull_busy_times: true,
      push_appointments: false,
      last_sync_error: null,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) {
    console.error("connection upsert failed", error);
    return redirect(`${APP_URL}/settings?calendar=error&reason=db`);
  }

  return redirect(`${APP_URL}/settings?calendar=connected`);
}

async function handleDisconnect(req: Request) {
  const userId = await userIdFromAuth(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: row } = await sb
    .from("calendar_connections")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  // Best-effort revoke.
  if (row?.access_token) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${row.access_token}`,
        { method: "POST" },
      );
    } catch {
      // continue — local delete still proceeds
    }
  }

  // Purge connection + any synced busy rows.
  await sb
    .from("calendar_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "google");
  await sb
    .from("calendar_synced_busy")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "google");

  return json({ ok: true }, 200);
}

// ---------- helpers ----------

async function userIdFromAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const sb = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

interface StatePayload {
  user_id: string;
  nonce: string;
  exp: number;
}

async function signState(payload: StatePayload): Promise<string> {
  const body = b64url(JSON.stringify(payload));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

async function verifyState(token: string): Promise<StatePayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmac(body);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body)) as StatePayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmac(text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(STATE_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(text),
  );
  return b64urlBytes(new Uint8Array(sig));
}

function b64url(s: string): string {
  return b64urlBytes(new TextEncoder().encode(s));
}

function b64urlBytes(buf: Uint8Array): string {
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function text(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function redirect(to: string) {
  return new Response(null, { status: 302, headers: { Location: to, ...cors } });
}
