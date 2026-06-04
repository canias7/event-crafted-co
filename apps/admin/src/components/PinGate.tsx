import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

// PIN gate + admin login in one. The 4-digit PIN is no longer checked in
// the browser (it used to be hardcoded here); instead it's sent to the
// `admin-session` edge function, which verifies it against the ADMIN_PIN
// secret and mints a Supabase session server-side — bypassing the project
// captcha that blocks the admin app's old headless signInWithPassword.
//
// The unlock state IS the Supabase session: supabase-js persists it
// (storageKey "vendora-admin-auth"), so a reload stays signed in until the
// session expires, at which point onAuthStateChange relocks us.
export function PinGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "unlocked">("checking");
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState(data.session ? "unlocked" : "locked");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setState(s ? "unlocked" : "locked");
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state === "locked") inputs.current[0]?.focus();
  }, [state]);

  const submit = async (code: string) => {
    if (code.length < 4 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const email = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
      const { data, error: fnErr } = await supabase.functions.invoke("admin-session", {
        body: { pin: code, ...(email ? { email } : {}) },
      });

      const token = (data as { access_token?: string } | null)?.access_token;
      if (fnErr || !token) {
        // Default message; refine it from the function's error payload.
        let msg = "Incorrect PIN.";
        const ctx = (fnErr as { context?: Response } | null)?.context;
        if (ctx && typeof ctx.json === "function") {
          const b = await ctx.clone().json().catch(() => null);
          if (b?.error === "too_many_attempts") {
            msg = b.message ?? "Too many attempts. Try again later.";
          } else if (b?.error === "admin_login_not_configured") {
            msg = "Admin login isn't configured yet (missing ADMIN_PIN).";
          } else if (b?.error && b.error !== "invalid_pin") {
            msg = b.message ?? b.error;
          }
        }
        setError(msg);
        setDigits(["", "", "", ""]);
        inputs.current[0]?.focus();
        return;
      }

      const d = data as { access_token: string; refresh_token: string };
      const { error: sErr } = await supabase.auth.setSession({
        access_token: d.access_token,
        refresh_token: d.refresh_token,
      });
      if (sErr) {
        setError(sErr.message);
        setDigits(["", "", "", ""]);
        inputs.current[0]?.focus();
        return;
      }
      setState("unlocked");
    } finally {
      setSubmitting(false);
    }
  };

  const onChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "").slice(-1);
    if (!v && raw !== "") return;
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    setError(null);
    if (v && i < 3) inputs.current[i + 1]?.focus();
    if (i === 3 && v) void submit(next.join(""));
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  if (state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bone text-sm text-ink/50">
        Loading…
      </div>
    );
  }
  if (state === "unlocked") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bone p-6">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-ink/50">Vendora</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Admin access</h1>
        <p className="mt-2 text-sm text-ink/60">Enter the 4-digit PIN to continue.</p>

        <div className="mt-6 flex justify-between gap-3">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              inputMode="numeric"
              autoComplete="off"
              maxLength={1}
              disabled={submitting}
              className="h-14 w-14 rounded-lg border border-ink/15 bg-white text-center font-mono text-2xl text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/40 disabled:opacity-50"
            />
          ))}
        </div>

        {submitting ? (
          <p className="mt-4 text-sm text-ink/50">Signing in…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : null}

        <p className="mt-6 text-xs text-ink/40">
          Authorized personnel only. Activity is logged.
        </p>
      </div>
    </div>
  );
}
