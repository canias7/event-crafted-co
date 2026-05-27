import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Live viewer count via Supabase Realtime presence. Each watcher and
// the host join the channel `live-viewers:<share_token>` and track a
// payload `{ role: "viewer" | "host" }`. The count returned is the
// number of viewers — the host is excluded so the broadcaster doesn't
// see themselves in their own audience count.
//
// Presence auto-cleans on tab close / disconnect, so we don't need a
// heartbeat or a server-side counter. Each tab gets a fresh random
// presence key so two tabs from the same person count as two viewers
// (which is the truthful behavior for a public watch link).
//
// Pass `enabled = false` when the modal isn't open / the watch page
// isn't visible to skip the websocket overhead entirely.

export function useLiveViewerCount(
  shareToken: string | null,
  role: "viewer" | "host",
  enabled: boolean = true,
): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!shareToken || !enabled) {
      setCount(0);
      return;
    }
    const key = `${role}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(`live-viewers:${shareToken}`, {
      config: { presence: { key } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<
          string,
          Array<{ role?: string }>
        >;
        let viewers = 0;
        for (const presences of Object.values(state)) {
          for (const p of presences) {
            if (p.role === "viewer") viewers += 1;
          }
        }
        setCount(viewers);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ role });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setCount(0);
    };
  }, [shareToken, role, enabled]);

  return count;
}
