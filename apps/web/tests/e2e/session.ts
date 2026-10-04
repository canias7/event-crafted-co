import type { Session } from "@supabase/supabase-js";

// Shared session helpers for the e2e and canary suites.
//
// This project enforces server-side auth CAPTCHA (and the web login adds an
// emailed 2FA code), so the public password / magic-link endpoints reject
// browserless sign-ins. The admin API isn't CAPTCHA-gated: with the service
// role we mint a one-time magic-link OTP for a DEDICATED TEST ACCOUNT and
// verify it for a real, ordinary user session. Everything after that runs as
// the ordinary user — the service role is only used to obtain the session.
//
// This is a SEEDED session: it proves "a signed-in vendor can use X", not
// "the login form works". The login UI is covered separately (and cannot be
// fully automated in production without weakening its protections).
//
// We hit GoTrue with plain fetch rather than supabase-js: createClient()
// spins up a realtime client that needs a WebSocket, which Node < 22 lacks.

export interface SessionConfig {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
}

function gotrue(cfg: SessionConfig, suffix: string, apikey: string, body: unknown) {
  return fetch(`${cfg.supabaseUrl}/auth/v1/${suffix}`, {
    method: "POST",
    headers: {
      apikey,
      authorization: `Bearer ${apikey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// GoTrue error bodies can echo the email; keep only the status + error code.
async function briefError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return `${res.status} ${j?.error_code ?? j?.code ?? j?.error ?? ""}`.trim();
  } catch {
    return `${res.status}`;
  }
}

export async function sessionViaServiceRole(cfg: SessionConfig, email: string): Promise<Session> {
  if (!cfg.serviceRoleKey) throw new Error("service role key not configured");
  const linkRes = await gotrue(cfg, "admin/generate_link", cfg.serviceRoleKey, {
    type: "magiclink",
    email,
  });
  if (!linkRes.ok) throw new Error(`generate_link failed: ${await briefError(linkRes)}`);
  const link = await linkRes.json();
  // GoTrue returns the OTP at the top level or under `properties`.
  const otp: string | undefined = link?.email_otp ?? link?.properties?.email_otp;
  if (!otp) throw new Error("generate_link returned no email_otp");

  const verifyRes = await gotrue(cfg, "verify", cfg.anonKey, { type: "email", email, token: otp });
  if (!verifyRes.ok) throw new Error(`verify failed: ${await briefError(verifyRes)}`);
  const session = (await verifyRes.json()) as Session;
  if (!session?.access_token) throw new Error("verify returned no access_token");
  return session;
}

// Fallback for projects WITHOUT auth captcha (password grant).
export async function sessionViaPassword(cfg: SessionConfig, email: string, password: string): Promise<Session> {
  const res = await gotrue(cfg, "token?grant_type=password", cfg.anonKey, { email, password });
  if (!res.ok) throw new Error(`password grant failed: ${await briefError(res)}`);
  const session = (await res.json()) as Session;
  if (!session?.access_token) throw new Error("password grant returned no access_token");
  return session;
}

// A Playwright storage state that seeds the session exactly as the browser
// client persists it (localStorage key `sb-<project-ref>-auth-token`).
export function storageStateFor(cfg: SessionConfig, appOrigin: string, session: Session) {
  const ref = new URL(cfg.supabaseUrl).hostname.split(".")[0];
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(appOrigin).origin,
        localStorage: [{ name: `sb-${ref}-auth-token`, value: JSON.stringify(session) }],
      },
    ],
  };
}

// Read the access token + user id back out of a storage state file, so API
// checks reuse the one session the setup minted (concurrent admin OTP
// generate/verify for the same user races — mint once, reuse).
export function sessionFromStorageState(state: {
  origins?: { localStorage?: { name: string; value: string }[] }[];
}): { token: string; uid: string } | null {
  for (const o of state.origins ?? []) {
    for (const item of o.localStorage ?? []) {
      if (!item.name.endsWith("-auth-token")) continue;
      try {
        const s = JSON.parse(item.value);
        if (s?.access_token && s?.user?.id) return { token: s.access_token, uid: s.user.id };
      } catch {
        // not a session entry
      }
    }
  }
  return null;
}
