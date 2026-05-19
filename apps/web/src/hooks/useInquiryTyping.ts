import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Inquiry-chat typing indicator over a Supabase broadcast channel.
// Each side calls broadcastTyping() on every keystroke; the hook
// throttles to once per second so we don't spam the channel, and the
// receiver auto-clears 3 seconds after the last "typing" event so the
// indicator doesn't get stuck if the sender stops typing without
// telling us.
//
// `self: false` on the broadcast config means we won't receive our
// own events back — the role-check below is defensive in case that
// flag is ignored.

export function useInquiryTyping(
  inquiryId: string | undefined | null,
  myRole: "vendor" | "host",
): { otherTyping: boolean; broadcastTyping: () => void } {
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const lastBroadcastRef = useRef(0);

  useEffect(() => {
    if (!inquiryId) return;
    const channel = supabase.channel(`inquiry-typing:${inquiryId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on(
        "broadcast",
        { event: "typing" },
        (msg: { payload?: { role?: string } }) => {
          if (msg.payload?.role && msg.payload.role !== myRole) {
            setOtherTyping(true);
            if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
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
  }, [inquiryId, myRole]);

  const broadcastTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastBroadcastRef.current < 1000) return;
    lastBroadcastRef.current = now;
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: { role: myRole },
    });
  }, [myRole]);

  return { otherTyping, broadcastTyping };
}
