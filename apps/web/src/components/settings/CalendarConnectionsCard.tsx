import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  Loader2,
  Plug,
  PlugZap,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import {
  loadCalendarConnections,
  startGoogleConnect,
  disconnectCalendar,
  triggerSync,
  updateCalendarPreference,
  type CalendarConnection,
} from "@/lib/calendar";

// Settings card: connect / disconnect Google Calendar, toggle the
// pull-busy and push-appointments preferences, manually trigger a sync.

export function CalendarConnectionsCard() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [connections, setConnections] = useState<CalendarConnection[] | null>(
    null,
  );
  const [busy, setBusy] = useState<"connect" | "disconnect" | "sync" | null>(
    null,
  );

  async function load() {
    try {
      const rows = await loadCalendarConnections();
      setConnections(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load");
      setConnections([]);
    }
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  // Surface the OAuth callback result + auto-trigger a first sync on
  // success so the UI shows pulled events without waiting for cron.
  useEffect(() => {
    const status = params.get("calendar");
    if (!status) return;
    if (status === "connected") {
      toast.success("Calendar connected");
      // Strip the param so a refresh doesn't re-toast.
      params.delete("calendar");
      setParams(params, { replace: true });
      load().then(() => {
        if (user) triggerSync(user.id);
      });
    } else if (status === "error") {
      const reason = params.get("reason") ?? "unknown";
      toast.error(`Calendar connect failed: ${reason}`);
      params.delete("calendar");
      params.delete("reason");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function onConnect() {
    setBusy("connect");
    const result = await startGoogleConnect();
    setBusy(null);
    if (result.ok === false) toast.error(result.reason);
    // On ok we redirect away — no toast.
  }

  async function onDisconnect() {
    if (!confirm("Disconnect Google Calendar? Synced busy times will be removed.")) return;
    setBusy("disconnect");
    const result = await disconnectCalendar();
    setBusy(null);
    if (result.ok === false) {
      toast.error(result.reason);
      return;
    }
    toast.success("Calendar disconnected");
    setConnections([]);
  }

  async function onSyncNow() {
    if (!user) return;
    setBusy("sync");
    const result = await triggerSync(user.id);
    setBusy(null);
    if (result.ok === false) {
      toast.error(result.reason);
      return;
    }
    toast.success("Sync started");
    setTimeout(load, 1500);
  }

  async function togglePref(
    id: string,
    key: "pull_busy_times" | "push_appointments",
    value: boolean,
  ) {
    try {
      await updateCalendarPreference(id, { [key]: value });
      setConnections((prev) =>
        prev?.map((c) => (c.id === id ? { ...c, [key]: value } : c)) ?? null,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  if (connections === null) {
    return (
      <div className="text-sm text-muted-foreground">Loading…</div>
    );
  }

  const google = connections.find((c) => c.provider === "google");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-1 inline-flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5" />
          Google Calendar
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Pull busy times from your personal calendar so they block
          Vendora availability automatically — stop maintaining two
          calendars.
        </p>
      </div>

      {google ? (
        <div className="rounded-sm border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium">
                {google.account_email ?? "Connected"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {google.last_synced_at
                  ? `Last synced ${new Date(google.last_synced_at).toLocaleString()}`
                  : "Awaiting first sync"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={onSyncNow}
                disabled={busy !== null}
              >
                {busy === "sync" ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Sync now
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={onDisconnect}
                disabled={busy !== null}
              >
                {busy === "disconnect" ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Plug className="w-3.5 h-3.5 mr-1.5" />
                )}
                Disconnect
              </Button>
            </div>
          </div>

          {google.last_sync_error && (
            <div className="flex items-start gap-2 text-xs bg-destructive/5 border border-destructive/20 rounded-sm p-2.5 text-destructive/85">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="leading-relaxed">
                Last sync error: {google.last_sync_error}
              </span>
            </div>
          )}

          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">Block Vendora when I'm busy</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Events in your Google Calendar marked busy show as
                  unavailable on your Vendora availability.
                </p>
              </div>
              <Switch
                checked={google.pull_busy_times}
                onCheckedChange={(v) => togglePref(google.id, "pull_busy_times", v)}
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">Push Vendora appointments to Google</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Auto-create a Google event for every accepted Vendora
                  appointment. Cancellations + declines are removed
                  automatically.
                </p>
              </div>
              <Switch
                checked={google.push_appointments}
                onCheckedChange={(v) => togglePref(google.id, "push_appointments", v)}
              />
            </div>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          onClick={onConnect}
          disabled={busy !== null}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          {busy === "connect" ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <PlugZap className="w-3.5 h-3.5 mr-1.5" />
          )}
          Connect Google Calendar
        </Button>
      )}
    </div>
  );
}
