import { useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface InquiryRow {
  id: string;
  event_type: string;
  event_date: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  status: string;
  quality_score: number | null;
  created_at: string;
  host: { display_name: string | null } | null;
  labels?: Array<{ id: string; name: string; color: string }>;
}

// Kanban columns map to the inquiries.status enum. We collapse
// new + drafted into one "New" column (a draft is just an AI-staged
// reply waiting on the vendor) and lost + expired into one "Closed"
// column (both are dead pipeline).
const COLUMNS: Array<{
  id: "new" | "replied" | "won" | "closed";
  label: string;
  matches: (status: string) => boolean;
  /** What status to set when a card is dropped here. */
  setStatus: "new" | "replied" | "won" | "lost";
  tone: string;
}> = [
  {
    id: "new",
    label: "New",
    matches: (s) => s === "new" || s === "drafted",
    setStatus: "new",
    tone: "border-accent/40",
  },
  {
    id: "replied",
    label: "Replied",
    matches: (s) => s === "replied",
    setStatus: "replied",
    tone: "border-foreground/40",
  },
  {
    id: "won",
    label: "Booked",
    matches: (s) => s === "won",
    setStatus: "won",
    tone: "border-accent/60",
  },
  {
    id: "closed",
    label: "Closed",
    matches: (s) => s === "lost" || s === "expired",
    setStatus: "lost",
    tone: "border-muted",
  },
];

function fmtMoney(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString()}`;
}

export function InquiryKanban({
  rows,
  onChange,
}: {
  rows: InquiryRow[];
  onChange: () => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function moveCard(id: string, nextStatus: string, fromStatus: string) {
    if (nextStatus === fromStatus) return;
    setUpdatingId(id);
    const { error } = await supabase
      .from("inquiries")
      .update({ status: nextStatus })
      .eq("id", id);
    setUpdatingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {COLUMNS.map((col) => {
        const cards = rows.filter((r) => col.matches(r.status));
        const isOver = dropTarget === col.id;
        return (
          <div
            key={col.id}
            className={`rounded-sm border bg-card flex flex-col min-h-[400px] transition-colors ${
              isOver ? "border-foreground bg-secondary/40" : col.tone
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(col.id);
            }}
            onDragLeave={() => {
              if (dropTarget === col.id) setDropTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget(null);
              const id = e.dataTransfer.getData("text/plain");
              const card = rows.find((r) => r.id === id);
              if (card) moveCard(id, col.setStatus, card.status);
            }}
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <p className="font-label text-muted-foreground">{col.label}</p>
              <span className="text-xs text-muted-foreground tnum">
                {cards.length}
              </span>
            </div>
            <div className="p-2 space-y-2 flex-1">
              {cards.length === 0 ? (
                <div className="flex flex-col items-center text-center py-10 text-muted-foreground/60">
                  <Inbox className="w-5 h-5 mb-2" />
                  <p className="text-xs">Empty</p>
                </div>
              ) : (
                cards.map((r) => (
                  <Card
                    key={r.id}
                    row={r}
                    dragging={draggingId === r.id}
                    updating={updatingId === r.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", r.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(r.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({
  row,
  dragging,
  updating,
  onDragStart,
  onDragEnd,
}: {
  row: InquiryRow;
  dragging: boolean;
  updating: boolean;
  onDragStart: React.DragEventHandler<HTMLDivElement>;
  onDragEnd: React.DragEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-sm border border-border bg-background p-3 cursor-grab active:cursor-grabbing transition-opacity ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-3 h-3 text-muted-foreground/40 mt-1 shrink-0 group-hover:text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/vendor/inbox/${row.id}`}
            className="font-medium text-sm block hover:text-accent leading-tight"
            onClick={(e) => {
              if (dragging) e.preventDefault();
            }}
          >
            {row.host?.display_name ?? "Unknown host"}
          </Link>
          <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
            {row.event_type.replace("_", " ")}
            {row.event_date && (
              <>
                {" · "}
                <span className="tnum">{row.event_date}</span>
              </>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground tnum mt-0.5">
            {fmtMoney(row.budget_min_cents)} – {fmtMoney(row.budget_max_cents)}
          </p>
          {(row.labels ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {(row.labels ?? []).map((l) => (
                <span
                  key={l.id}
                  className="inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: `${l.color}22`,
                    color: l.color,
                  }}
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </div>
        {updating && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
