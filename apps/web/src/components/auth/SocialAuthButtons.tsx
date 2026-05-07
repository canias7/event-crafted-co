import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Google + Apple OAuth buttons. Uses Supabase's built-in OAuth flow.
// Provider configuration happens in Supabase dashboard (Authentication →
// Providers → enable + paste client id/secret).
//
// Operator setup notes:
// - Google: register OAuth client at console.cloud.google.com (Web app),
//   set authorized redirect URI to <SUPABASE_URL>/auth/v1/callback,
//   paste client id + secret into Supabase Google provider config.
// - Apple: requires an Apple Developer account ($99/yr). Create a
//   Services ID + Sign-In-With-Apple key, paste into Supabase Apple
//   provider config. iOS App Store now REQUIRES Sign In with Apple as
//   an option whenever any other social sign-in is offered.
//
// Buttons gracefully fail if the provider isn't enabled (Supabase
// returns an error which we toast).

type Provider = "google" | "apple";

const PROVIDERS: Array<{
  id: Provider;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    id: "google",
    label: "Continue with Google",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
        <path
          fill="#4285F4"
          d="M22.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.09-1.92 3.22-4.74 3.22-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0012 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.12A6.61 6.61 0 015.5 12c0-.74.13-1.45.34-2.12V7.04H2.18A11 11 0 001 12c0 1.78.42 3.46 1.18 4.96l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.99 10.99 0 002.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
        />
      </svg>
    ),
  },
  {
    id: "apple",
    label: "Continue with Apple",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    ),
  },
];

interface Props {
  redirectTo?: string;
}

export function SocialAuthButtons({ redirectTo }: Props) {
  const [loading, setLoading] = useState<Provider | null>(null);

  async function signIn(provider: Provider) {
    setLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo:
          redirectTo ??
          (typeof window !== "undefined"
            ? `${window.location.origin}/customer/dashboard`
            : undefined),
      },
    });
    if (error) {
      setLoading(null);
      toast.error(
        error.message ||
          `${provider} sign-in isn't configured yet — see Supabase dashboard.`,
      );
    }
    // On success Supabase redirects the browser to the OAuth flow,
    // so we leave loading state set; the redirect kills this component.
  }

  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => signIn(p.id)}
          disabled={loading !== null}
          className="w-full h-11 rounded-sm border border-border bg-background hover:bg-secondary transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading === p.id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            p.icon
          )}
          {p.label}
        </button>
      ))}
    </div>
  );
}
