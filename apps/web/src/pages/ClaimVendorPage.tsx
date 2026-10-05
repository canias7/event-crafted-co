import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { useCategoryNames } from "@/lib/categoryNames";

// Error codes from claim_vendor_listing that have their own message
// (claim.json → toast.<code>); anything else gets toast.fallback.
const CLAIM_ERRORS = [
  "not_authenticated",
  "invalid_token",
  "already_claimed",
  "already_owned",
];

// Public claim page — vendor visits /claim/{token} from an invite
// email. Shows a preview of the stub profile pre-created by an admin
// + a "Claim this listing" CTA. Auth-gated: signed-out users see a
// sign-up CTA preserving the token in the redirect path.
//
// Once claimed, the vendor profile's user_id is the claimer's
// auth.uid() and they can edit the profile from /vendor/profile like
// any other vendor.

interface ClaimData {
  invite: {
    email: string;
    status: "pending" | "contacted" | "accepted" | "declined";
    created_at: string;
  };
  vendor: {
    id: string;
    business_name: string;
    category: string;
    location: string | null;
    already_owned: boolean;
  };
}

export default function ClaimVendorPage() {
  const { token } = useParams();
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation("claim");
  const categories = useCategoryNames();
  const [data, setData] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useDocumentMeta({
    title: t("meta.title"),
    description: t("meta.description"),
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result } = await (supabase as any).rpc(
        "get_claim_invitation_by_token",
        { p_token: token },
      );
      if (cancelled) return;
      if (!result) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setData(result as ClaimData);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function claim() {
    if (!token || !session) return;
    setClaiming(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error } = await (supabase as any).rpc(
      "claim_vendor_listing",
      { p_token: token },
    );
    setClaiming(false);
    if (error) {
      // English shows the server's message as before; Spanish shows a
      // translated line instead of the raw (English) database error.
      toast.error(t("toast.error", { message: error.message }));
      return;
    }
    const r = result as { ok: boolean; error?: string } | null;
    if (!r?.ok) {
      const code = r?.error ?? "";
      toast.error(
        CLAIM_ERRORS.includes(code) ? t(`toast.${code}`) : t("toast.fallback"),
      );
      return;
    }
    toast.success(t("toast.claimed"));
    navigate("/vendor/me");
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
          <h1 className="font-editorial text-4xl mb-3">{t("notFound.title")}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            {t("notFound.body")}
          </p>
          <Link to="/">
            <Button variant="outline" className="rounded-full">
              {t("notFound.back")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const alreadyClaimed =
    data.invite.status === "accepted" || data.vendor.already_owned;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
      <div className="max-w-md w-full">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="font-label text-accent tracking-[0.4em]">
            {t("eyebrow")}
          </p>
        </div>
        <h1 className="font-editorial text-5xl md:text-5xl leading-tight mb-3">
          {data.vendor.business_name}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {data.vendor.category
            ? categories.sub(data.vendor.category)
            : data.vendor.category}
          {data.vendor.location ? ` · ${data.vendor.location}` : null}
        </p>

        <div className="card-soft p-5 mb-6">
          <p className="text-sm leading-relaxed mb-3">
            <Trans
              t={t}
              i18nKey="intro"
              components={{
                name: <span className="font-medium">{data.vendor.business_name}</span>,
              }}
            />
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("invitedVia", { email: data.invite.email })}
          </p>
        </div>

        {alreadyClaimed ? (
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 mb-4 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
            <p className="text-sm leading-relaxed">
              <Trans
                t={t}
                i18nKey="alreadyClaimed"
                components={{
                  signInLink: <Link to="/login" className="text-accent underline" />,
                }}
              />
            </p>
          </div>
        ) : !session ? (
          <div className="space-y-3">
            <Link
              to={`/signup?ref=claim:${token}&email=${encodeURIComponent(data.invite.email)}`}
            >
              <Button className="w-full">
                {t("signUp")}
              </Button>
            </Link>
            <Link to={`/login?next=/claim/${token}`}>
              <Button variant="outline" className="w-full rounded-full h-11">
                {t("signIn")}
              </Button>
            </Link>
          </div>
        ) : (
          <Button
            onClick={claim}
            disabled={claiming}
            className="w-full"
          >
            {claiming && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("claim")}
          </Button>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
          <Trans
            t={t}
            i18nKey="notYours"
            components={{
              mail: <a href="mailto:hello@eventvendora.com" className="text-accent underline" />,
            }}
          />
        </p>
      </div>
    </div>
  );
}
