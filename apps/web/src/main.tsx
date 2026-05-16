import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Pre-mount safety check: if the Supabase env vars are missing the
// supabase client throws during construction and React renders nothing
// (blank white page). Detect that here and show a real error instead
// of a silent crash.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const root = document.getElementById("root")!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f7f5f2;color:#1a1a1a;">
      <div style="max-width:480px;background:#ffffff;border-radius:8px;padding:32px;border:1px solid #ececec;">
        <p style="font-size:12px;letter-spacing:0.18em;color:#1B3654;text-transform:uppercase;margin:0 0 16px;">Vendora · Configuration error</p>
        <h1 style="font-size:22px;line-height:1.3;font-weight:600;margin:0 0 12px;">Missing Supabase environment variables</h1>
        <p style="font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 16px;">
          The app can't start because <code style="background:#f5f5f5;padding:1px 6px;border-radius:3px;font-size:13px;">VITE_SUPABASE_URL</code>
          ${!SUPABASE_URL && !SUPABASE_KEY ? "and" : !SUPABASE_URL ? "is" : "or"}
          <code style="background:#f5f5f5;padding:1px 6px;border-radius:3px;font-size:13px;">VITE_SUPABASE_PUBLISHABLE_KEY</code>
          ${!SUPABASE_URL || !SUPABASE_KEY ? "isn't set." : "are missing."}
        </p>
        <p style="font-size:13px;line-height:1.6;color:#777;margin:0;">
          Local: copy <code style="background:#f5f5f5;padding:1px 6px;border-radius:3px;">.env.example</code> to <code style="background:#f5f5f5;padding:1px 6px;border-radius:3px;">.env.local</code> with your project URL + anon key.
          Hosted: set them in your deploy environment (Lovable / Vercel / etc.) and rebuild.
        </p>
      </div>
    </div>`;
} else {
  createRoot(root).render(<App />);

  // Register the service worker that handles web push + offline shell.
  // Production-only — dev breaks HMR if the SW caches stale assets.
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Swallow — push is opt-in; if the SW fails the rest of the
          // app still works.
          console.warn("SW register failed:", err);
        });
    });
  }
}
