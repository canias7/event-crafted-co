import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import heroImg from "@/assets/vendora-hero-cinematic.jpg";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
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
              — RESET ACCESS
            </p>
            <p className="text-3xl lg:text-4xl font-display leading-[1.1] max-w-sm">
              We'll email you a{" "}
              <span className="italic font-light text-accent">fresh link.</span>
            </p>
          </div>
          <p className="text-xs text-background/50 tracking-wide">© 2026 Vendora</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-display text-2xl block mb-8">
            Vendora
          </Link>

          <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mb-6">
            <KeyRound className="w-5 h-5" />
          </div>

          <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
            Forgot password?
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            Enter the email on your account and we'll send a reset link.
          </p>

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-sm border border-accent/30 bg-accent/5 p-4">
                <p className="text-sm leading-relaxed">
                  Check your inbox at{" "}
                  <span className="font-medium">{email}</span> for a reset
                  link. It'll expire in an hour.
                </p>
              </div>
              <Link to="/login" className="block">
                <Button variant="outline" className="w-full h-11 rounded-full">
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {submitting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Send reset link
              </Button>
            </form>
          )}

          <p className="text-sm text-muted-foreground mt-8 text-center">
            Remembered it?{" "}
            <Link to="/login" className="text-accent font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
