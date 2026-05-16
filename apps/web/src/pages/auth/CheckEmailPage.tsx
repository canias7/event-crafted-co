import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GlassyAuthShell } from "@/components/auth/GlassyAuthShell";

export default function CheckEmailPage() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const role = params.get("role") === "vendor" ? "vendor" : "host";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function resend() {
    if (!email) {
      toast.error("Email missing — start over from signup.");
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    setResending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setResent(true);
    toast.success("Confirmation email sent");
  }

  const isVendor = role === "vendor";

  return (
    <GlassyAuthShell
      title={isVendor ? "Application" : "Check your"}
      titleAccent={isVendor ? "received." : "email."}
      subtitle={
        isVendor
          ? `Thanks for applying. Our team hand-reviews every application — we'll email ${email || "you"} within 2–3 business days. If approved, that email will include your sign-in details.`
          : email
            ? `We sent a confirmation link to ${email}. Click it to finish signing up.`
            : "We sent you a confirmation link. Click it to finish signing up."
      }
      pillLabel={isVendor ? "UNDER REVIEW" : "HOST SIGN UP"}
      topRight={
        <Link
          to="/login"
          className="pb-px font-medium"
          style={{ borderBottom: "0.5px solid #000" }}
        >
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-5">
        <div
          className="flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(255,138,76,0.15)",
            color: "#c4541e",
          }}
        >
          <Mail className="w-6 h-6" />
        </div>

        {/* Vendors don't get a resend button — the email is informational
            only (no confirm link). They wait for admin approval. */}
        {!isVendor && (
          <button
            type="button"
            onClick={resend}
            disabled={resending || resent || !email}
            className="auth-submit w-full"
          >
            {resending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : resent ? (
              "Sent — check your inbox"
            ) : (
              <>
                Resend email
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}

        <p
          className="text-center font-editorial italic"
          style={{ fontSize: "12.5px", opacity: 0.7, lineHeight: 1.5 }}
        >
          {isVendor ? (
            <>
              Questions? Email{" "}
              <a
                href="mailto:hello@vendora.events"
                className="font-medium pb-px"
                style={{ borderBottom: "0.5px solid currentColor" }}
              >
                hello@vendora.events
              </a>
              .
            </>
          ) : (
            <>
              Didn't get it? Check your spam folder. If it still doesn't arrive,
              email{" "}
              <a
                href="mailto:hello@vendora.events"
                className="font-medium pb-px"
                style={{ borderBottom: "0.5px solid currentColor" }}
              >
                hello@vendora.events
              </a>
              .
            </>
          )}
        </p>
      </div>
    </GlassyAuthShell>
  );
}
