import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 card-shadow">
        <Link to="/" className="font-display text-2xl">Vendora</Link>
        <h1 className="font-display text-3xl mt-6 mb-2">Create your account</h1>
        <p className="text-sm text-muted-foreground mb-6">Choose how you'll use the platform</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>I am a…</Label>
            <RadioGroup value={role} onValueChange={(v) => setRole(v as "host" | "vendor")} className="grid grid-cols-2 gap-3 mt-2">
              <label className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer ${role === "host" ? "border-accent bg-accent/5" : "border-border"}`}>
                <RadioGroupItem value="host" id="host" />
                <div>
                  <div className="text-sm font-medium">Host</div>
                  <div className="text-xs text-muted-foreground">Plan an event</div>
                </div>
              </label>
              <label className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer ${role === "vendor" ? "border-accent bg-accent/5" : "border-border"}`}>
                <RadioGroupItem value="vendor" id="vendor" />
                <div>
                  <div className="text-sm font-medium">Vendor</div>
                  <div className="text-xs text-muted-foreground">Offer services</div>
                </div>
              </label>
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground mt-6 text-center">
          Already have an account? <Link to="/login" className="text-accent font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}