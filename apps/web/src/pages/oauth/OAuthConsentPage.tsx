// OAuth 2.1 consent page. Lands at /oauth/consent?... after Claude
// redirects the user from /functions/v1/mcp-oauth-authorize. The
// edge function has already validated client_id + redirect_uri +
// PKCE; this page just renders a consent UI and, on Approve, POSTs
// back to the same edge function with the user's session JWT. The
// function mints the code and returns the final redirect URL.
//
// If the user isn't logged in we bounce to /signin?next=…&return…
// with the entire consent URL preserved.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { VendoraForClaudeLogo } from "@/components/super-agents/AgentLogos";
import { toast } from "sonner";

const AUTHORIZE_URL =
  "https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/mcp-oauth-authorize";

export default function OAuthConsentPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const consentParams = useMemo(() => {
    return {
      client_id: params.get("client_id") ?? "",
      redirect_uri: params.get("redirect_uri") ?? "",
      response_type: params.get("response_type") ?? "",
      code_challenge: params.get("code_challenge") ?? "",
      code_challenge_method: params.get("code_challenge_method") ?? "",
      state: params.get("state") ?? "",
      scope: params.get("scope") ?? "vendora",
    };
  }, [params]);

  const missingParams =
    !consentParams.client_id ||
    !consentParams.redirect_uri ||
    !consentParams.code_challenge;

  // If not logged in, redirect to /signin with a return path that
  // brings us back here once auth succeeds.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      const target = `${window.location.pathname}${window.location.search}`;
      navigate(`/login/vendor?next=${encodeURIComponent(target)}`, { replace: true });
    }
  }, [loading, user, navigate]);

  async function approve() {
    setSubmitting(true);
    const { data: session } = await supabase.auth.getSession();
    const accessToken = session.session?.access_token;
    if (!accessToken) {
      toast.error("Sign in expired. Please log in again.");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(AUTHORIZE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(consentParams),
      });
      const body = await res.json();
      if (!res.ok || !body?.redirect_to) {
        toast.error(body?.error_description ?? body?.error ?? "Couldn't approve.");
        setSubmitting(false);
        return;
      }
      window.location.replace(body.redirect_to);
    } catch (err) {
      toast.error("Network error. Try again.");
      setSubmitting(false);
    }
  }

  function deny() {
    if (!consentParams.redirect_uri) return;
    const url = new URL(consentParams.redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (consentParams.state) url.searchParams.set("state", consentParams.state);
    window.location.replace(url.toString());
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-black/50" />
      </div>
    );
  }

  if (missingParams) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <X className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-medium text-black mb-2">
            Bad authorization request
          </h1>
          <p className="text-sm text-black/65">
            This page expects to be opened from Claude's connector flow. The
            authorization request is missing required parameters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-gradient-to-b from-white to-neutral-50">
      <div className="w-full max-w-md bg-white rounded-2xl border border-black/10 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.15)] overflow-hidden">
        <div className="p-6 border-b border-black/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden ring-1 ring-black/5">
              <VendoraForClaudeLogo className="w-full h-full block" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/55">
                Claude wants to connect
              </p>
              <h1 className="font-editorial text-xl text-black leading-tight">
                Vendora for Claude
              </h1>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-black/75">
            Claude is asking to connect to your EventVendora account on your behalf.
          </p>
          <div className="rounded-lg border border-black/10 bg-neutral-50 p-3 space-y-2">
            <div className="flex items-start gap-2 text-xs text-black/70">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Read your inquiries, threads, HILUX settings, and listings.
              </span>
            </div>
            <div className="flex items-start gap-2 text-xs text-black/70">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Send replies, mark inquiries, pause HILUX, regenerate replies, update settings.
              </span>
            </div>
            <div className="flex items-start gap-2 text-xs text-black/70">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Read your HILUX activity log.
              </span>
            </div>
          </div>
          <p className="text-[11px] text-black/55">
            You can revoke this connection any time from the Vendora for Claude
            panel in your vendor settings. The access token expires after 1 hour
            and rotates on every refresh.
          </p>
          <div className="text-[11px] text-black/45 break-all">
            Returns to: {consentParams.redirect_uri}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-black/10 flex items-center justify-end gap-2 bg-neutral-50">
          <Button
            variant="ghost"
            onClick={deny}
            disabled={submitting}
            className="text-black/70"
          >
            Deny
          </Button>
          <Button onClick={approve} disabled={submitting}>
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
            ) : null}
            Approve & connect
          </Button>
        </div>
      </div>
    </div>
  );
}
