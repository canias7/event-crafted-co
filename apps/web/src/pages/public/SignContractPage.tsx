// Public e-sign page. A host lands here from a "Review & sign" link the
// vendor sent. They read the contract, type their name as a signature,
// confirm, and sign. Backed by the SECURITY DEFINER RPCs
// get_contract_for_signing / sign_contract (token-gated, no auth needed).

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { siteLocaleOr } from "@/lib/intlLocale";
import { Check, Loader2, FileSignature, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/SignaturePad";
import { downloadSignedContractPdf } from "@/lib/signedContractPdf";

interface SignContract {
  id: string;
  title: string;
  body: string;
  status: string;
  recipient_name: string | null;
  signer_name: string | null;
  signed_at: string | null;
  vendor_business_name: string | null;
  signature_image: string | null;
  recipient_email_masked: string | null;
  has_fixed_recipient: boolean;
}

// `locale` is "en-US" in English (as before), "es-US" in Spanish and
// "ru-RU" in Russian.
function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SignContractPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation("checkout");
  const dateLocale = siteLocaleOr("en-US");
  const [contract, setContract] = useState<SignContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

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

  // Signing is locked to the contract's bound recipient: the code only ever
  // goes to that address, so the signer never supplies an email. A contract
  // with no recipient on file can't be signed.
  const fixedRecipient = !!contract?.has_fixed_recipient;

  async function sendCode() {
    if (!token || sendingCode || !fixedRecipient) return;
    setSendingCode(true);
    const { error } = await supabase.functions.invoke("contract-send-otp", {
      body: { token },
    });
    setSendingCode(false);
    if (error) {
      toast.error(t("sign.toast.codeError"), {
        description: t("sign.toast.codeErrorBody"),
      });
      return;
    }
    setCodeSent(true);
    toast.success(t("sign.toast.codeSent"));
  }

  async function sign() {
    if (
      !token ||
      !agreed ||
      !signerName.trim() ||
      !fixedRecipient ||
      !otp.trim() ||
      signing
    )
      return;
    setSigning(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("sign_contract", {
      p_token: token,
      p_signer_name: signerName.trim(),
      p_signature_image: signatureImage,
      p_email: null,
      p_otp: otp.trim(),
    });
    setSigning(false);
    if (error) {
      const m = String(error.message || "");
      const friendly = m.includes("invalid_code")
        ? t("sign.toast.invalidCode")
        : m.includes("code_expired_or_missing")
          ? t("sign.toast.codeExpired")
          : m.includes("too_many_attempts")
            ? t("sign.toast.tooManyAttempts")
            : t("sign.toast.signError");
      toast.error(friendly);
      return;
    }
    if (data === "signed") {
      toast.success(t("sign.toast.signed"));
      setContract((c) =>
        c
          ? {
              ...c,
              status: "signed",
              signer_name: signerName.trim(),
              signed_at: new Date().toISOString(),
              signature_image: signatureImage,
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
          <h1 className="font-editorial text-3xl mb-2">{t("sign.notFound.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("sign.notFound.body")}
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
            ? t("sign.headerVendor", { vendor: contract.vendor_business_name })
            : t("sign.header")}
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
          <div className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap border-t border-foreground/10 pt-4">
            {contract.body}
          </div>

          <div className="border-t border-foreground/10 mt-6 pt-6">
            {isSigned ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl bg-muted border border-border p-4">
                  <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {t("sign.signedBy", { name: contract.signer_name ?? "" })}
                    </p>
                    <p className="text-sm text-foreground">
                      {fmtDate(contract.signed_at, dateLocale)}
                    </p>
                    {contract.signature_image ? (
                      <img
                        src={contract.signature_image}
                        alt={t("sign.signatureAlt")}
                        className="mt-2 h-14 bg-white rounded border border-border"
                      />
                    ) : (
                      <p
                        className="mt-1 text-2xl text-foreground"
                        style={{ fontFamily: "'Brush Script MT', cursive" }}
                      >
                        {contract.signer_name}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => downloadSignedContractPdf(contract)}
                  className="rounded-full"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  {t("sign.downloadPdf")}
                </Button>
              </div>
            ) : isOpen && fixedRecipient ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("sign.nameLabel")}
                  </label>
                  <Input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder={t("sign.namePlaceholder")}
                    className="mt-1"
                  />
                  {signerName.trim() && !signatureImage ? (
                    <p
                      className="mt-2 text-2xl text-foreground"
                      style={{ fontFamily: "'Brush Script MT', cursive" }}
                    >
                      {signerName.trim()}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("sign.drawLabel")}
                  </label>
                  <div className="mt-1">
                    <SignaturePad onChange={setSignatureImage} />
                  </div>
                </div>
                {/* Email verification — the one-time code only ever goes to
                    the contract's bound recipient, so only they can sign. */}
                <div className="border-t border-foreground/10 pt-4">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("sign.verifyLabel")}
                  </label>
                  <div className="mt-1 flex gap-2 items-center">
                    <div className="flex-1 rounded-md border border-foreground/15 bg-muted/40 px-3 py-2 text-sm text-foreground">
                      <Trans
                        t={t}
                        i18nKey="sign.codeTo"
                        components={{
                          email: (
                            <span className="font-medium">
                              {contract.recipient_email_masked}
                            </span>
                          ),
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={sendCode}
                      disabled={sendingCode}
                      className="rounded-full shrink-0"
                    >
                      {sendingCode ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : codeSent ? (
                        t("sign.resend")
                      ) : (
                        t("sign.sendCode")
                      )}
                    </Button>
                  </div>
                  {codeSent ? (
                    <div className="mt-2">
                      <Input
                        inputMode="numeric"
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder={t("sign.codePlaceholder")}
                        className="tracking-[0.4em] text-center"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {t("sign.codeSentTo", {
                          email: contract.recipient_email_masked ?? "",
                        })}
                      </p>
                    </div>
                  ) : null}
                </div>
                <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {t("sign.consent")}
                  </span>
                </label>
                <Button
                  onClick={sign}
                  disabled={
                    !agreed ||
                    !signerName.trim() ||
                    otp.trim().length < 6 ||
                    signing
                  }
                  className="rounded-full w-full sm:w-auto"
                >
                  {signing ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <FileSignature className="w-4 h-4 mr-1.5" />
                  )}
                  {t("sign.submit")}
                </Button>
              </div>
            ) : isOpen ? (
              <p className="text-sm text-muted-foreground">
                {contract.vendor_business_name
                  ? t("sign.notReadyVendor", { vendor: contract.vendor_business_name })
                  : t("sign.notReady")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t([`sign.closed.${contract.status}`, "sign.closed.other"], {
                  status: contract.status,
                })}
              </p>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          {t("sign.poweredBy")}
        </p>
      </div>
    </div>
  );
}
