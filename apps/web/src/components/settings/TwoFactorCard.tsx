import { useEffect, useState } from "react";
import {
  Loader2,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// 2FA via Supabase MFA TOTP. Flow:
//   1. enroll() returns { id, totp: { qr_code, secret, uri } }
//   2. user scans QR with their authenticator app (Authy, 1Password, etc)
//   3. user types the 6-digit code → challenge() + verify()
//   4. on success the factor is "verified" and required at next sign-in
// Disabling: unenroll(factor_id).

interface Factor {
  id: string;
  factor_type: string;
  status: "verified" | "unverified";
  friendly_name: string | null;
  created_at: string;
}

export function TwoFactorCard() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollOpen, setEnrollOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    setLoading(false);
    if (error) {
      // Likely Supabase MFA isn't enabled yet — surface gracefully.
      setFactors([]);
      return;
    }
    setFactors((data?.totp ?? []) as Factor[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function disable(factorId: string) {
    if (!confirm("Disable 2FA on this device? You'll only need your password to sign in next time.")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("2FA disabled");
    load();
  }

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-1 inline-flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5" />
          Two-factor authentication
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Adds a second layer to sign-in: your password + a 6-digit code
          from an authenticator app (Authy, 1Password, Google Authenticator).
          Recommended for vendors and admins.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : verified.length === 0 ? (
        <Button
          type="button"
          onClick={() => setEnrollOpen(true)}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
          Enable 2FA
        </Button>
      ) : (
        <div className="space-y-2">
          {verified.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 card-soft p-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="w-4 h-4 text-accent shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {f.friendly_name ?? "Authenticator app"}
                  </p>
                  <p className="text-[11px] text-muted-foreground tnum">
                    Added {new Date(f.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => disable(f.id)}
                className="rounded-full text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEnrollOpen(true)}
            className="rounded-full"
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            Add another device
          </Button>
        </div>
      )}

      <EnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        onEnrolled={load}
      />
    </div>
  );
}

function EnrollDialog({
  open,
  onOpenChange,
  onEnrolled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEnrolled: () => void;
}) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCode("");
    setEnrolling(true);
    supabase.auth.mfa
      .enroll({
        factorType: "totp",
        friendlyName: `Vendora · ${new Date().toLocaleDateString()}`,
      })
      .then(({ data, error: err }) => {
        setEnrolling(false);
        if (err) {
          setError(err.message);
          return;
        }
        setFactorId(data?.id ?? null);
        setQrCode((data?.totp as { qr_code?: string } | undefined)?.qr_code ?? null);
        setSecret((data?.totp as { secret?: string } | undefined)?.secret ?? null);
      });
  }, [open]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !code.trim()) return;
    setVerifying(true);
    const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (chalErr || !chal) {
      setVerifying(false);
      toast.error(chalErr?.message ?? "Couldn't request challenge");
      return;
    }
    const { error: verErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: chal.id,
      code: code.trim(),
    });
    setVerifying(false);
    if (verErr) {
      toast.error(verErr.message);
      return;
    }
    toast.success("2FA enabled");
    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setCode("");
    onOpenChange(false);
    onEnrolled();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">
            Enable 2FA
          </DialogTitle>
          <DialogDescription>
            Scan the QR with your authenticator app, then type the 6-digit
            code to confirm.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex items-start gap-2 text-sm bg-destructive/5 border border-destructive/20 rounded-sm p-3 text-destructive/85">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        ) : enrolling ? (
          <div className="text-center py-6">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : qrCode ? (
          <form onSubmit={verify} className="space-y-4 pt-2">
            <div className="flex justify-center">
              <div
                className="bg-white rounded-sm p-3 inline-block"
                dangerouslySetInnerHTML={{ __html: qrCode }}
              />
            </div>
            {secret && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground select-none">
                  Can't scan? Use this secret instead
                </summary>
                <p className="font-mono text-[11px] bg-secondary/40 rounded-sm p-2 mt-2 break-all">
                  {secret}
                </p>
              </details>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code">6-digit code from your app</Label>
              <Input
                id="mfa-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                required
                className="font-mono text-center text-lg tracking-widest"
              />
            </div>
            <DialogFooter className="pt-1 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={verifying}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={verifying || code.length !== 6}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {verifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Verify + enable
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
