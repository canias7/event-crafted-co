// Public e-sign page. A host lands here from a "Review & sign" link the
// vendor sent. They read the contract, type their name as a signature,
// confirm, and sign. Backed by the SECURITY DEFINER RPCs
// get_contract_for_signing / sign_contract (token-gated, no auth needed).

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Loader2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SignContract {
  id: string;
  title: string;
  body: string;
  status: string;
  recipient_name: string | null;
  signer_name: string | null;
  signed_at: string | null;
  vendor_business_name: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SignContractPage() {
  const { token } = useParams<{ token: string }>();
  const [contract, setContract] = useState<SignContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "get_contract_for_signing",
      { p_token: token },
    );
    const row = Array.isArray(data) ? (data[0] as SignContract | undefined) : null;
    if (error || !row) {
      setContract(null);
    } else {
      setContract(row);
      setSignerName((prev) => prev || row.recipient_name || "");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sign() {
    if (!token || !agreed || !signerName.trim() || signing) return;
    setSigning(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("sign_contract", {
      p_token: token,
      p_signer_name: signerName.trim(),
    });
    setSigning(false);
    if (error) {
      toast.error("Couldn't record your signature", {
        description: error.message,
      });
      return;
    }
    if (data === "signed") {
      toast.success("Signed — thank you!");
      setContract((c) =>
        c
          ? {
              ...c,
              status: "signed",
              signer_name: signerName.trim(),
              signed_at: new Date().toISOString(),
            }
          : c,
      );
    } else {
      // Already signed/voided elsewhere — refetch to show the real state.
      void load();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen public-canvas flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen public-canvas flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="font-editorial text-3xl mb-2">Contract not found</h1>
          <p className="text-sm text-muted-foreground">
            This signing link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  const isSigned = contract.status === "signed";
  const isOpen = contract.status === "sent";

  return (
    <div className="min-h-screen public-canvas py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <FileSignature className="w-4 h-4" />
          {contract.vendor_business_name
            ? `${contract.vendor_business_name} · Contract`
            : "Contract"}
        </div>

        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: "0.5px solid rgba(0,0,0,0.10)",
            boxShadow: "0 18px 50px -24px rgba(0,0,0,0.25)",
          }}
        >
          <h1 className="font-editorial text-3xl mb-4">{contract.title}</h1>
          <div className="text-[14px] leading-relaxed text-foreground/90 whitespace-pre-wrap border-t border-foreground/10 pt-4">
            {contract.body}
          </div>

          <div className="border-t border-foreground/10 mt-6 pt-6">
            {isSigned ? (
              <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-900">
                    Signed by {contract.signer_name}
                  </p>
                  <p className="text-sm text-emerald-800/80">
                    {fmtDate(contract.signed_at)}
                  </p>
                </div>
              </div>
            ) : isOpen ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Type your full name to sign
                  </label>
                  <Input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Your full name"
                    className="mt-1"
                  />
                  {signerName.trim() ? (
                    <p
                      className="mt-2 text-2xl text-foreground/90"
                      style={{ fontFamily: "'Brush Script MT', cursive" }}
                    >
                      {signerName.trim()}
                    </p>
                  ) : null}
                </div>
                <label className="flex items-start gap-2 text-sm text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I have read and agree to this contract, and my typed name
                    above is my legally binding electronic signature.
                  </span>
                </label>
                <Button
                  onClick={sign}
                  disabled={!agreed || !signerName.trim() || signing}
                  className="rounded-full w-full sm:w-auto"
                >
                  {signing ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <FileSignature className="w-4 h-4 mr-1.5" />
                  )}
                  Sign contract
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This contract is {contract.status} and can no longer be signed.
              </p>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Powered by Vendora · electronic signatures
        </p>
      </div>
    </div>
  );
}
