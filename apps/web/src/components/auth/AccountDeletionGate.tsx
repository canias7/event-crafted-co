import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AuthBackdrop } from "@/components/auth/AuthBackdrop";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { intlLocale } from "@/lib/intlLocale";

// A closed account waiting out its 30-day grace period (owner's call,
// Oct 2026): profiles.deletion_scheduled_for is set. While it is, the
// signed-in user can't use the site; every page is replaced by this
// screen, which offers Restore (restore_account_deletion(): clears the
// date and un-pauses the listings that were paused for the deletion) or
// Sign out. The vendor and host apps show the same screen.
export function AccountDeletionGate({ children }: { children: ReactNode }) {
  const { user, deletionScheduledFor } = useAuth();
  if (!user || !deletionScheduledFor) return <>{children}</>;
  return <DeletionScheduledScreen scheduledFor={deletionScheduledFor} />;
}

function DeletionScheduledScreen({ scheduledFor }: { scheduledFor: string }) {
  const { t } = useTranslation("auth");
  const { signOut, refreshProfile } = useAuth();
  const [busy, setBusy] = useState<"restore" | "signout" | null>(null);

  const date = new Intl.DateTimeFormat(intlLocale(), {
    dateStyle: "long",
  }).format(new Date(scheduledFor));

  async function restore() {
    setBusy("restore");
    const { error } = await supabase.rpc("restore_account_deletion");
    if (error) {
      setBusy(null);
      toast.error(t("deletion_gate.error", { message: error.message }));
      return;
    }
    await refreshProfile();
    setBusy(null);
    toast.success(t("deletion_gate.restored"));
  }

  async function leave() {
    setBusy("signout");
    await signOut();
    setBusy(null);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#14161a] text-[#f4f1ea]">
      <AuthBackdrop />
      <AuthTopBar />
      <main
        id="main-content"
        className="relative z-[2] flex min-h-screen items-center justify-center px-5 pb-16 pt-32 md:px-8"
      >
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/[0.03] p-6 text-center md:p-8">
          <h1 className="font-editorial text-3xl leading-tight md:text-4xl">
            {t("deletion_gate.title")}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed">
            {t("deletion_gate.body", { date })}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#f4f1ea]/80">
            {t("deletion_gate.note")}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" onClick={restore} disabled={busy !== null}>
              {busy === "restore" && <Loader2 className="animate-spin" />}
              {t("deletion_gate.restore")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={leave}
              disabled={busy !== null}
            >
              {busy === "signout" && <Loader2 className="animate-spin" />}
              {t("deletion_gate.sign_out")}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
