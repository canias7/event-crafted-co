// "Delete" button + confirm dialog for closing an account. Used on
// /settings (hosts and vendors) and on the host's Profile → Account
// settings page, the same place the host app has it. The
// delete-account function cancels any Stripe plan, then closes the
// account: it's permanently deleted after 30 days unless the user signs
// back in and restores it (AccountDeletionGate).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// The error code a failed edge function sent back, if it sent JSON.
async function readFunctionError(error: unknown): Promise<string | null> {
  const res = (error as { context?: Response })?.context;
  if (!res || typeof res.json !== "function") return null;
  try {
    const body = await res.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

export function DeleteAccountButton() {
  const navigate = useNavigate();
  const { t } = useTranslation("settings");
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    setDeleting(true);
    const { error } = await supabase.functions.invoke("delete-account", {
      body: {},
    });
    if (error) {
      setDeleting(false);
      const code = await readFunctionError(error);
      toast.error(
        code === "subscription_cancel_failed"
          ? t("delete.plan_error")
          : t("delete.error", { message: error.message }),
      );
      return;
    }
    await supabase.auth.signOut();
    setDeleting(false);
    toast.success(t("delete.success"));
    navigate("/", { replace: true });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          {t("delete.button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-editorial text-3xl">
            {t("delete.confirm_title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {t("delete.confirm_body")}
            {` ${t("delete.confirm_body_plan")}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel disabled={deleting} className="rounded-full">
            {t("delete.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              deleteAccount();
            }}
            disabled={deleting}
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
