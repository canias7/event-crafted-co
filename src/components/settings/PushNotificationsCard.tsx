import { useEffect, useState } from "react";
import { Loader2, BellRing, BellOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  enablePush,
  disablePush,
  isPushSubscribed,
  getPushPermissionState,
  type PushPermissionState,
} from "@/lib/push";

// Settings section that lets a user enable / disable web push on the
// current device. State is per-browser — subscribing on iPhone Safari
// doesn't subscribe on a desktop tab. Each shows up as a separate row
// in push_subscriptions.

export function PushNotificationsCard() {
  const [perm, setPerm] = useState<PushPermissionState | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPerm(getPushPermissionState());
    isPushSubscribed().then((s) => !cancelled && setSubscribed(s));
    return () => {
      cancelled = true;
    };
  }, []);

  async function onEnable() {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    setPerm(getPushPermissionState());
    setSubscribed(true);
    toast.success("Push notifications enabled on this device");
  }

  async function onDisable() {
    setBusy(true);
    try {
      await disablePush();
      setSubscribed(false);
      toast.success("Push disabled on this device");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disable");
    } finally {
      setBusy(false);
    }
  }

  if (perm === null) return null;

  if (perm === "unsupported") {
    return (
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-secondary/50 rounded-sm p-3">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        Your browser doesn't support push notifications. iOS Safari needs
        the app added to your home screen first.
      </div>
    );
  }

  if (perm === "denied") {
    return (
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-destructive/5 border border-destructive/20 rounded-sm p-3">
        <BellOff className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
        Notifications were blocked for Vendora. Enable them in your browser
        site settings, then come back and toggle this on.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium mb-1">
          Push notifications on this device
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Get pinged when a vendor replies, a host sends an inquiry, or a
          proposal lands — without keeping the tab open.
        </p>
      </div>
      {subscribed ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full shrink-0"
          onClick={onDisable}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <BellOff className="w-3.5 h-3.5 mr-1.5" />
          )}
          Disable
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className="rounded-full shrink-0 bg-foreground text-background hover:bg-foreground/90"
          onClick={onEnable}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <BellRing className="w-3.5 h-3.5 mr-1.5" />
          )}
          Enable
        </Button>
      )}
    </div>
  );
}
