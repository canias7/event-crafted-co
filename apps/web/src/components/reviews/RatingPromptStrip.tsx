// In-thread CTA strip that nudges the caller to rate the other
// party. Shows the appropriate prompt depending on what's unlocked:
//
//   • Event review available  → "How was your event?" (CTA opens
//     RatingModal in event mode). Highest priority.
//   • Conversation rating available + not yet left → quieter
//     "Rate this conversation" CTA.
//   • Already rated → nothing.
//
// All eligibility is double-checked server-side by the BEFORE
// INSERT trigger on reviews; this component is just discovery /
// scheduling.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";
import { RatingModal } from "@/components/reviews/RatingModal";

interface Props {
  inquiryId: string;
  vendorId: string;
  hostId: string;
  eventDate: string | null;
  raterRole: "host" | "vendor";
  otherPartyName: string;
}

interface ExistingRating {
  kind: "conversation" | "event";
}

export function RatingPromptStrip({
  inquiryId,
  vendorId,
  hostId,
  eventDate,
  raterRole,
  otherPartyName,
}: Props) {
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [myRatings, setMyRatings] = useState<ExistingRating[] | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  // In-app purchase signal — reviews (event AND conversation) only unlock
  // once the host paid a pay link tied to this inquiry (webhook stamps
  // inquiries.paid_booked_at). Both host + vendor can read their own
  // inquiry, so this matches what the server gate enforces.
  const [paidBooked, setPaidBooked] = useState<boolean | null>(null);
  const [modalKind, setModalKind] = useState<"conversation" | "event" | null>(
    null,
  );

  // Pull the two signals we need: message count for this inquiry's
  // thread, and whether the caller has already rated (so we don't
  // re-prompt). Proposals were retired — event-review eligibility now
  // keys off the event date alone (the reviews BEFORE INSERT trigger
  // still double-checks eligibility server-side).
  const refresh = useCallback(async () => {
    if (!inquiryId) return;
    const [tRes, rRes, iRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("direct_threads")
        .select("id")
        .eq("inquiry_id", inquiryId)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("reviews")
        .select("kind")
        .eq("inquiry_id", inquiryId)
        .eq("rater_role", raterRole),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("inquiries")
        .select("paid_booked_at")
        .eq("id", inquiryId)
        .maybeSingle(),
    ]);
    const thread = (tRes.data as { id?: string } | null)?.id ?? null;
    setThreadId(thread);
    setPaidBooked(
      Boolean((iRes.data as { paid_booked_at?: string | null } | null)?.paid_booked_at),
    );
    if (thread) {
      const { count } = await supabase
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", thread);
      setMessageCount(count ?? 0);
    } else {
      setMessageCount(0);
    }
    setMyRatings((rRes.data as ExistingRating[] | null) ?? []);
  }, [inquiryId, raterRole]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime triggers:
  //   • reviews on this inquiry — your own insert hides the strip,
  //     the other side's insert flips eligibility for the next prompt.
  //   • direct_messages on this thread — bumps the ≥6 conversation
  //     threshold without waiting for a page reload.
  //   • proposals on this inquiry — acceptance unlocks the event
  //     review eligibility.
  useRealtime(
    inquiryId ? { table: "reviews", filter: `inquiry_id=eq.${inquiryId}` } : null,
    refresh,
  );
  useRealtime(
    threadId ? { table: "direct_messages", filter: `thread_id=eq.${threadId}` } : null,
    refresh,
  );

  // Event review: requires an in-app purchase AND the event day to have
  // ended (opens the day after event_date). Matches the server gate.
  const eventEligible = useMemo(() => {
    if (!paidBooked || !eventDate) return false;
    // event_date is a calendar date; eligible once today is past it.
    const todayStr = new Date().toISOString().slice(0, 10);
    return eventDate < todayStr;
  }, [paidBooked, eventDate]);

  // Conversation review: requires an in-app purchase AND ≥6 messages.
  const conversationEligible = useMemo(() => {
    return Boolean(paidBooked) && (messageCount ?? 0) >= 6;
  }, [paidBooked, messageCount]);

  const already = useMemo(() => {
    const set = new Set((myRatings ?? []).map((r) => r.kind));
    return { conversation: set.has("conversation"), event: set.has("event") };
  }, [myRatings]);

  // Decide what (if anything) to surface. Event takes priority
  // when both are eligible — it's the higher-stakes signal.
  if (myRatings === null || paidBooked === null) return null;

  if (eventEligible && !already.event) {
    return (
      <>
        <PromptCard
          kind="event"
          onClick={() => setModalKind("event")}
          otherPartyName={otherPartyName}
        />
        {modalKind ? (
          <RatingModal
            open={modalKind !== null}
            onOpenChange={(open) => setModalKind(open ? modalKind : null)}
            kind={modalKind}
            raterRole={raterRole}
            inquiryId={inquiryId}
            vendorId={vendorId}
            hostId={hostId}
            otherPartyName={otherPartyName}
            onSuccess={() => {
              setMyRatings((prev) => [...(prev ?? []), { kind: modalKind! }]);
              setModalKind(null);
            }}
          />
        ) : null}
      </>
    );
  }

  if (conversationEligible && !already.conversation) {
    return (
      <>
        <PromptCard
          kind="conversation"
          onClick={() => setModalKind("conversation")}
          otherPartyName={otherPartyName}
        />
        {modalKind ? (
          <RatingModal
            open={modalKind !== null}
            onOpenChange={(open) => setModalKind(open ? modalKind : null)}
            kind={modalKind}
            raterRole={raterRole}
            inquiryId={inquiryId}
            vendorId={vendorId}
            hostId={hostId}
            otherPartyName={otherPartyName}
            onSuccess={() => {
              setMyRatings((prev) => [...(prev ?? []), { kind: modalKind! }]);
              setModalKind(null);
            }}
          />
        ) : null}
      </>
    );
  }

  return null;
}

function PromptCard({
  kind,
  onClick,
  otherPartyName,
}: {
  kind: "conversation" | "event";
  onClick: () => void;
  otherPartyName: string;
}) {
  const isEvent = kind === "event";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl px-4 py-3 transition-colors my-3"
      style={{
        background: isEvent
          ? "linear-gradient(135deg, rgba(255,138,76,0.14), rgba(255,138,76,0.05))"
          : "rgba(255,253,250,0.7)",
        border: isEvent
          ? "0.5px solid rgba(255,138,76,0.35)"
          : "0.5px solid rgba(255,138,76,0.18)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center"
          style={{
            background: "rgba(255,138,76,0.16)",
            color: "#c4541e",
          }}
          aria-hidden
        >
          {isEvent ? <Sparkles className="w-4 h-4" /> : <Star className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">
            {isEvent
              ? `How was your event with ${otherPartyName}?`
              : `Rate ${otherPartyName}'s communication`}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isEvent
              ? "Leave an event review — visible once both sides review."
              : "Quick read on this conversation."}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-foreground/70 underline underline-offset-2">
          Rate
        </span>
      </div>
    </button>
  );
}
