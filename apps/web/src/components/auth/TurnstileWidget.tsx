import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile widget wrapper. Self-contained — no NPM
// dependency. Loads the official Cloudflare script once (idempotent
// across multiple mount/unmount cycles) and renders the widget via
// the global `window.turnstile.render` API.
//
// Site key is hardcoded because it's public by design (Cloudflare's
// hostname allowlist on the widget side is what gates abuse, not
// secrecy of the site key). The matching SECRET key lives only in
// Supabase Auth → Attack Protection → Captcha secret.

const SITE_KEY = "0x4AAAAAADRMhOHbjApvJ3Cq";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileGlobal {
  render: (
    container: HTMLElement | string,
    opts: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "flexible" | "compact";
      appearance?: "always" | "execute" | "interaction-only";
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

// Promise singleton so concurrent mounts don't append the script twice.
let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="https://challenges.cloudflare.com/turnstile"]`,
    );
    if (existing) {
      // Another mount already injected it — wait for it.
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Turnstile script failed to load")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export function TurnstileWidget({
  onVerify,
  onExpire,
  resetKey = 0,
}: {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  // Bump this from the parent to force a fresh token (after a failed
  // submit or on expiry). Turnstile tokens are single-use and time out,
  // so a retry MUST re-challenge or Cloudflare rejects it as
  // "timeout-or-duplicate".
  resetKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => onVerify(token),
          "expired-callback": () => onExpire?.(),
          "error-callback": () => setFailed(true),
          theme: "light",
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          /* widget already removed — ignore */
        }
      }
    };
    // onVerify / onExpire are intentionally not deps: we render the
    // widget once on mount; parent components keep stable refs in
    // practice (they wrap setState directly).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-challenge for a fresh token whenever the parent bumps resetKey
  // (skips the initial mount, which already rendered a widget).
  const firstResetRef = useRef(true);
  useEffect(() => {
    if (firstResetRef.current) {
      firstResetRef.current = false;
      return;
    }
    const id = widgetIdRef.current;
    if (id && window.turnstile) {
      try {
        window.turnstile.reset(id);
        setFailed(false);
      } catch {
        /* widget not ready — ignore */
      }
    }
  }, [resetKey]);

  if (failed) {
    return (
      <p className="text-xs text-destructive">
        Couldn't load the bot-check. Refresh the page and try again.
      </p>
    );
  }
  return <div ref={containerRef} style={{ display: "inline-block" }} />;
}
