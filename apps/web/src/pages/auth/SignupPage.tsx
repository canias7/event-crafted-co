import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GlassyAuthShell } from "@/components/auth/GlassyAuthShell";

// `role` decides what the user is signing up as. Default "host" keeps
// the existing behavior (post-signup → /customer/onboarding). When
// passed "vendor", we route the user to /vendor/me after signup so
// they can build their first listing. The auth.users row is the
// same either way — role differentiation happens at the next step
// (onboarded_at vs. inserting a vendor_profiles row), with DB
// triggers enforcing the one-role-per-email rule.
export default function SignupPage({ role = "host" }: { role?: "host" | "vendor" } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adult) {
      toast.error("You must confirm you're 18 or older to sign up.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: name, intended_role: role },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      navigate(`/check-email?email=${encodeURIComponent(email)}&role=${role}`);
      return;
    }
    toast.success("Account created");
    navigate(role === "vendor" ? "/vendor/me" : "/customer/onboarding");
  }

  const isVendor = role === "vendor";
  const pillLabel = isVendor ? "VENDOR SIGN UP" : "HOST SIGN UP";
  const accentWord = isVendor ? "vendor." : "host.";
  const otherSidePath = isVendor ? "/signup/host" : "/signup/vendor";
  const otherSideLabel = isVendor ? "Sign up as a host" : "Sign up as a vendor";

  return (
    <GlassyAuthShell
      title={isVendor ? "List with Vendora," : "Plan with Vendora,"}
      titleAccent={accentWord}
      subtitle={
        isVendor
          ? "Create a vendor account. Your first listing is hand-reviewed before going live."
          : "Create a host account. Free, takes a minute."
      }
      pillLabel={pillLabel}
      topRight={
        <>
          <Link to="/support" className="opacity-60">
            Need help?
          </Link>
          <span>
            <span style={{ opacity: 0.6 }}>Already have an account? </span>
            <Link
              to="/login"
              className="pb-px font-medium"
              style={{ borderBottom: "0.5px solid #000" }}
            >
              {t("auth.signup.sign_in")}
            </Link>
          </span>
        </>
      }
      belowCardLink={
        <div>
          <span style={{ opacity: 0.6 }}>On the other side? </span>
          <Link
            to={otherSidePath}
            className="font-medium pb-px"
            style={{ borderBottom: "0.5px solid #000", color: "#000" }}
          >
            {otherSideLabel}
          </Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <div>
          <div
            className="uppercase mb-1.5"
            style={{ fontSize: "11px", letterSpacing: "1.5px", opacity: 0.65, fontWeight: 500 }}
          >
            {t("auth.signup.name_label")}
          </div>
          <input
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Your name"
          />
        </div>
        <div>
          <div
            className="uppercase mb-1.5"
            style={{ fontSize: "11px", letterSpacing: "1.5px", opacity: 0.65, fontWeight: 500 }}
          >
            {t("auth.common.email")}
          </div>
          <input
            className="auth-input"
            type="email"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div
            className="uppercase mb-1.5"
            style={{ fontSize: "11px", letterSpacing: "1.5px", opacity: 0.65, fontWeight: 500 }}
          >
            {t("auth.common.password")}
          </div>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder={t("auth.signup.password_hint")}
            autoComplete="new-password"
          />
        </div>
        <label
          className="flex items-start cursor-pointer pt-1"
          style={{ gap: "8px", fontSize: "12px", opacity: 0.8 }}
        >
          <span
            className="shrink-0 inline-flex items-center justify-center"
            style={{
              width: 16,
              height: 16,
              border: "0.5px solid rgba(0,0,0,0.3)",
              borderRadius: "3px",
              background: adult ? "#000" : "rgba(255,255,255,0.6)",
              marginTop: "1px",
            }}
            onClick={() => setAdult((v) => !v)}
          >
            {adult && <Check className="w-3 h-3 text-white" />}
          </span>
          <input
            type="checkbox"
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            className="sr-only"
          />
          <span className="leading-relaxed">
            {t("auth.signup.adult_lead")}{" "}
            <Link
              to="/terms"
              className="pb-px font-medium"
              style={{ borderBottom: "0.5px solid currentColor" }}
              target="_blank"
            >
              {t("auth.signup.adult_terms")}
            </Link>{" "}
            {t("auth.signup.adult_and")}{" "}
            <Link
              to="/privacy"
              className="pb-px font-medium"
              style={{ borderBottom: "0.5px solid currentColor" }}
              target="_blank"
            >
              {t("auth.signup.adult_privacy")}
            </Link>
            .
          </span>
        </label>
        <button type="submit" disabled={loading || !adult} className="auth-submit mt-2">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("auth.common.creating")}
            </>
          ) : (
            <>
              {t("auth.signup.submit")}
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
        <p
          className="text-center font-editorial italic"
          style={{ fontSize: "12.5px", opacity: 0.55, marginTop: "6px", lineHeight: 1.5 }}
        >
          We don't sell your data, ever.
        </p>
      </form>
    </GlassyAuthShell>
  );
}
