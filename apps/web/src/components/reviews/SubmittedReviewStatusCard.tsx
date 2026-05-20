// Surfaces the caller's OWN submitted reviews on the inquiry detail
// page (host or vendor side). Renders one tile per review with status:
//
//   • Conversation rating → always released; shows "Live" stamp
//   • Event review released → "Both reviewed" stamp
//   • Event review unreleased → "Waiting for {otherParty}" with the
//     14-day grace explainer. The other party doesn't know they were
//     reviewed (mutual blind reveal) so we don't link them to act.
//
// Edit affordance: within 10 minutes of created_at, the tile shows
// an "Edit" button that opens RatingModal in edit mode. The window
// is enforced server-side by the update_review RPC + the rater
// UPDATE policy; the client clock is just a hint.
//
// Replaces the legacy amber "Leave review" card on the host inquiry
// page — RatingPromptStrip now handles the discovery CTA, this is
// purely the post-submit status surface.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, Pencil, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";

const RatingModal = lazy(() =>
  import("./RatingModal").then((m) => ({ default: m.RatingModal })),
);

const EDIT_WINDOW_MS = 10 * 60 * 1000;

interface Props {
  inquiryId: string;
  raterRole: "host" | "vendor";
  otherPartyName: string;
}

interface Row {
  id: string;
  kind: "conversation" | "event";
  rating: number;
  body: string | null;
  vendor_id: string;
  host_id: string;
  created_at: string;
  released_at: string | null;
}

export function SubmittedReviewStatusCard({
  inquiryId,
  raterRole,
  otherPartyName,
}: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editingRow, setEditingRow] = useState<Row | null>(null);

  const refresh = useCallback(async () => {
    if (!inquiryId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("reviews")
      .select(
        "id, kind, rating, body, vendor_id, host_id, created_at, released_at",
      )
      .eq("inquiry_id", inquiryId)
      .eq("rater_role", raterRole)
      .order("created_at", { ascending: false });
    setRows((data as Row[] | null) ?? []);
  }, [inquiryId, raterRole]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtime(
    inquiryId ? { table: "reviews", filter: `inquiry_id=eq.${inquiryId}` } : null,
    refresh,
  );

  const submitted = useMemo(() => rows ?? [], [rows]);
  if (rows === null || submitted.length === 0) return null;

  return (
    <div className="my-3 space-y-2">
      {submitted.map((r) => (
        <StatusTile
          key={r.id}
          row={r}
          otherPartyName={otherPartyName}
          onEdit={() => setEditingRow(r)}
        />
      ))}
      {editingRow && (
        <Suspense fallback={null}>
          <RatingModal
            open
            onOpenChange={(o) => !o && setEditingRow(null)}
            kind={editingRow.kind}
            raterRole={raterRole}
            inquiryId={inquiryId}
            vendorId={editingRow.vendor_id}
            hostId={editingRow.host_id}
            otherPartyName={otherPartyName}
            editing={{
              id: editingRow.id,
              rating: editingRow.rating,
              body: editingRow.body,
            }}
            onSuccess={() => {
              setEditingRow(null);
              refresh();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function StatusTile({
  row,
  otherPartyName,
  onEdit,
}: {
  row: Row;
  otherPartyName: string;
  onEdit: () => void;
}) {
  const isEvent = row.kind === "event";
  const waiting = isEvent && row.released_at === null;

  const stamp = waiting
    ? `Waiting for ${otherPartyName}`
    : isEvent
      ? "Both reviewed · live"
      : "Live";

  const stampColor = waiting ? "text-foreground/60" : "text-accent";

  const msSinceSubmit = Date.now() - new Date(row.created_at).getTime();
  const editable = msSinceSubmit < EDIT_WINDOW_MS;
  const minutesLeft = editable
    ? Math.max(1, Math.ceil((EDIT_WINDOW_MS - msSinceSubmit) / 60_000))
    : 0;

  return (
    <div
      className="rounded-2xl px-4 py-3"
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
            background: waiting
              ? "rgba(0,0,0,0.04)"
              : "rgba(255,138,76,0.16)",
            color: waiting ? "#666" : "#c4541e",
          }}
          aria-hidden
        >
          {waiting ? <Clock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium leading-tight">
              {isEvent ? "Event review submitted" : "Conversation rating submitted"}
            </p>
            <span className={`text-[11px] font-medium ${stampColor}`}>
              {stamp}
            </span>
            {editable && (
              <button
                type="button"
                onClick={onEdit}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                aria-label={`Edit (${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"} left)`}
              >
                <Pencil className="w-3 h-3" />
                Edit ({minutesLeft}m left)
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-3 h-3 ${
                  i < row.rating
                    ? "fill-accent text-accent"
                    : "text-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          {row.body && (
            <p className="text-xs text-foreground/75 mt-1.5 leading-relaxed italic line-clamp-3">
              "{row.body}"
            </p>
          )}
          {waiting && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Hidden until they review too — or goes live in 14 days.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
