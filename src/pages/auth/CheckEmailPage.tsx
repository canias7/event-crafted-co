import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/vendora-hero-cinematic.jpg";

export default function CheckEmailPage() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
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

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden">
        <img
          src={heroImg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/85 via-foreground/60 to-foreground/35" />
        <div className="relative z-10 flex flex-col justify-between p-10 lg:p-14 text-background w-full">
          <Link to="/" className="font-display text-2xl">
            Vendora
          </Link>
          <div>
            <p className="font-label text-accent tracking-[0.4em] mb-5">
              — ALMOST THERE
            </p>
            <p className="text-3xl lg:text-4xl font-display leading-[1.1] max-w-sm">
              One last{" "}
              <span className="italic font-light text-accent">step.</span>
            </p>
          </div>
          <p className="text-xs text-background/50 tracking-wide">
            © 2026 Vendora
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-display text-2xl block mb-8">
            Vendora
          </Link>

          <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mb-6">
            <Mail className="w-5 h-5" />
          </div>

          <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            {email ? (
              <>
                We sent a confirmation link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
                Click it to finish signing up.
              </>
            ) : (
              "We sent you a confirmation link. Click it to finish signing up."
            )}
          </p>

          <div className="space-y-3">
            <Button
              onClick={resend}
              disabled={resending || resent || !email}
              variant="outline"
              className="w-full h-11 rounded-full"
            >
              {resending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : resent ? (
                "Sent — check your inbox"
              ) : (
                "Resend email"
              )}
            </Button>
            <Link to="/login" className="block">
              <Button variant="ghost" className="w-full h-11 rounded-full">
                Back to sign in
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground mt-8 leading-relaxed">
            Didn't get it? Check your spam folder. If it still doesn't arrive,
            email{" "}
            <a
              href="mailto:hello@vendora.events"
              className="text-accent font-medium"
            >
              hello@vendora.events
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
