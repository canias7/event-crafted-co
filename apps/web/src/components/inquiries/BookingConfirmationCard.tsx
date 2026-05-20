// Off-platform booking handshake. When a host + vendor close the
// deal off-platform (Venmo deposit, phone call, in-person), there's
// no accepted proposal in the DB and the event-review gate stays
// shut forever. This card lets either side stamp "yes, we did work
// together"; when both stamps land, the gate trigger treats it as
// booked and event reviews open.
//
// Hidden when an accepted proposal already exists — the proposals
// path is the canonical one and this is the fallback.
//
// State machine driven by the two timestamps on inquiries:
//   • (null, null)         → initial   ("Did you work with…?")
//   • own set, other null  → waiting   ("Waiting for…")
//   • other set, own null  → pending   ("…says you worked together. Confirm?")
//   • both set             → confirmed ("Booking confirmed.")

import { useCallback, useEffect, useState } from "react";
import { Check, Handshake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRealtime } from "@/lib/realtime";

interface Props {
  inquiryId: string;
  selfRole: "host" | "vendor";
  otherPartyName: string;
  hasAcceptedProposal: boolean;
  onChange?: () => void;
}

interface Stamps {
  host_confirmed_booked_at: string | null;
  vendor_confirmed_booked_at: string | null;
}

const ERROR_LABELS: Record<string, string> = {
  not_authorized: "You're not allowed to mark this inquiry as booked.",
  not_found: "Inquiry not found — refresh and try again.",
};

export function BookingConfirmationCard({
  inquiryId,
  selfRole,
  otherPartyName,
  hasAcceptedProposal,
  onChange,
}: Props) {
  const [stamps, setStamps] = useState<Stamps | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!inquiryId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("inquiries")
      .select("host_confirmed_booked_at, vendor_confirmed_booked_at")
      .eq("id", inquiryId)
      .maybeSingle();
    setStamps((data as Stamps | null) ?? null);
  }, [inquiryId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtime(
    inquiryId ? { table: "inquiries", filter: `id=eq.${inquiryId}` } : null,
    refresh,
  );

  async function markBooked() {
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("mark_inquiry_booked", {
      p_inquiry_id: inquiryId,
    });
    setSubmitting(false);
    if (error) {
      toast.error(ERROR_LABELS[error.message] ?? error.message);
      return;
    }
    toast.success("Marked as booked.");
    await refresh();
    onChange?.();
  }

  if (hasAcceptedProposal) return null;
  if (stamps === null) return null;

  const ownStamped =
    selfRole === "host"
      ? stamps.host_confirmed_booked_at !== null
      : stamps.vendor_confirmed_booked_at !== null;
  const otherStamped =
    selfRole === "host"
      ? stamps.vendor_confirmed_booked_at !== null
      : stamps.host_confirmed_booked_at !== null;

  const otherSideLabel = selfRole === "host" ? "vendor" : "host";

  const state: "initial" | "waiting" | "pending" | "confirmed" = ownStamped
    ? otherStamped
      ? "confirmed"
      : "waiting"
    : otherStamped
      ? "pending"
      : "initial";

  return (
    <div
      className="my-3 rounded-2xl px-4 py-4"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.18)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center"
          style={{
            background:
              state === "confirmed"
                ? "rgba(255,138,76,0.16)"
                : "rgba(0,0,0,0.04)",
            color: state === "confirmed" ? "#c4541e" : "#666",
          }}
          aria-hidden
        >
          {state === "confirmed" ? (
            <Check className="w-4 h-4" />
          ) : (
            <Handshake className="w-4 h-4" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          {state === "initial" && (
            <>
              <p className="text-sm font-medium leading-tight">
                Did you work with {otherPartyName}?
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                If you closed off-platform (no proposal here), confirm so
                event reviews can open on both sides.
              </p>
              <Button
                size="sm"
                onClick={markBooked}
                disabled={submitting}
                className="mt-3 rounded-full"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Yes, we worked together
              </Button>
            </>
          )}

          {state === "waiting" && (
            <>
              <p className="text-sm font-medium leading-tight">
                Waiting for {otherPartyName} to confirm
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                You marked this booked. Event reviews open once the {otherSideLabel}{" "}
                confirms too.
              </p>
            </>
          )}

          {state === "pending" && (
            <>
              <p className="text-sm font-medium leading-tight">
                {otherPartyName} says you worked together
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Confirm to unlock event reviews on both sides.
              </p>
              <Button
                size="sm"
                onClick={markBooked}
                disabled={submitting}
                className="mt-3 rounded-full"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Confirm
              </Button>
            </>
          )}

          {state === "confirmed" && (
            <>
              <p className="text-sm font-medium leading-tight">
                Booking confirmed
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Event reviews open 3 days after the event date.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
