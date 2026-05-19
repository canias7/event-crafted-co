import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Chat typing indicator over a Supabase broadcast channel.
//
// Each side calls broadcastTyping() on every keystroke; the hook
// throttles to once per second so we don't spam the channel, and the
// receiver auto-clears 3 seconds after the last "typing" event so the
// indicator doesn't get stuck if the sender stops without telling us.
//
// `channelKey` is the unique channel name (e.g. `inquiry-typing:<id>`
// or `partner-typing:<id>`). `myKey` is whatever uniquely identifies
// the current participant — on the inquiry chat it's the role
// ("vendor" or "host") because there are exactly two roles; on the
// partner chat both sides are vendors so the auth user id is used.
// The hook broadcasts `myKey` in the payload and treats any non-self
// payload as "the other side is typing".
//
// `self: false` on the broadcast config means we won't receive our
// own events back — the key-check below is defensive in case that
// flag is ignored.

export function useChatTyping(
  channelKey: string | null,
  myKey: string,
): { otherTyping: boolean; broadcastTyping: () => void } {
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const lastBroadcastRef = useRef(0);

  useEffect(() => {
    if (!channelKey) return;
    const channel = supabase.channel(channelKey, {
      config: { broadcast: { self: false } },
    });
    channel
      .on(
        "broadcast",
        { event: "typing" },
        (msg: { payload?: { key?: string } }) => {
          if (msg.payload?.key && msg.payload.key !== myKey) {
            setOtherTyping(true);
            if (clearTimerRef.current)
              window.clearTimeout(clearTimerRef.current);
            clearTimerRef.current = window.setTimeout(() => {
              setOtherTyping(false);
            }, 3000);
          }
        },
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      setOtherTyping(false);
    };
  }, [channelKey, myKey]);

  const broadcastTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastBroadcastRef.current < 1000) return;
    lastBroadcastRef.current = now;
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: { key: myKey },
    });
  }, [myKey]);

  return { otherTyping, broadcastTyping };
}
