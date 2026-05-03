import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import heroImg from "@/assets/vendora-hero-dinner.jpg";

export default function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"host" | "vendor">("host");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: name, role },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created");
    navigate(role === "vendor" ? "/vendor/dashboard" : "/customer/onboarding");
  }

  return (
    <div className="min-h-screen flex">
      {/* Brand panel */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden">
        <img
          src={heroImg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/85 via-foreground/60 to-foreground/35" />
        <div
          className="absolute inset-0 opacity-[0.07] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
          }}
        />

        <div className="relative z-10 flex flex-col justify-between p-10 lg:p-14 text-background w-full">
          <Link to="/" className="font-display text-2xl">
            Vendora
          </Link>

          <div>
            <div className="flex items-center gap-3 mb-5">
              <p className="font-label text-accent tracking-[0.4em]">
                — JOIN VENDORA
              </p>
              <span className="h-px w-8 bg-accent/40" />
            </div>
            <p className="text-3xl lg:text-4xl font-display leading-[1.1] max-w-sm">
              Plan something{" "}
              <span className="italic font-light text-accent">unforgettable.</span>
            </p>
            <p className="text-sm text-background/70 mt-5 max-w-sm leading-relaxed">
              Hand-selected vendors, AI-assisted replies, and the calm tools
              to run your event end-to-end.
            </p>
          </div>

          <p className="text-xs text-background/50 tracking-wide">
            © 2026 Vendora — Now in private beta
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-display text-2xl block mb-8">
            Vendora
          </Link>

          <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
            Create your account
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Choose how you'll use the platform.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>I am a…</Label>
              <RadioGroup
                value={role}
                onValueChange={(v) => setRole(v as "host" | "vendor")}
                className="grid grid-cols-2 gap-2 mt-1"
              >
                <label
                  className={`flex items-center gap-3 border rounded-sm p-3 cursor-pointer transition-colors ${
                    role === "host"
                      ? "border-foreground bg-foreground/5"
                      : "border-border"
                  }`}
                >
                  <RadioGroupItem value="host" id="host" />
                  <div>
                    <div className="text-sm font-medium">Host</div>
                    <div className="text-xs text-muted-foreground">
                      Plan an event
                    </div>
                  </div>
                </label>
                <label
                  className={`flex items-center gap-3 border rounded-sm p-3 cursor-pointer transition-colors ${
                    role === "vendor"
                      ? "border-foreground bg-foreground/5"
                      : "border-border"
                  }`}
                >
                  <RadioGroupItem value="vendor" id="vendor" />
                  <div>
                    <div className="text-sm font-medium">Vendor</div>
                    <div className="text-xs text-muted-foreground">
                      Offer services
                    </div>
                  </div>
                </label>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11"
              />
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-full bg-foreground text-background hover:bg-foreground/90 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground mt-8 text-center">
            Already have an account?{" "}
            <Link to="/login" className="text-accent font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
