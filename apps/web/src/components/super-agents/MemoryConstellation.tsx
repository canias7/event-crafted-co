// My Space "memory" surface, reimagined as a full-screen dark
// constellation: a central hub with each saved fact orbiting on a
// connecting line, gently drifting. Click a node to view / edit /
// delete; add new memories from the bottom pill.
//
// Backed by the same my_space_knowledge table the chat AI loads into
// its system prompt every turn (category, title, content). This is
// purely the visual review/manage surface — most adds still happen
// through chat ("remember that my hourly rate is $150").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BadgeDollarSign,
  Boxes,
  HelpCircle,
  Loader2,
  MessageSquareQuote,
  Pencil,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { VendoraMark } from "@/components/shared/VendoraLogo";

const CATEGORIES = [
  { key: "pricing", label: "Pricing", icon: BadgeDollarSign, color: "#ffc14d" },
  { key: "services", label: "Services", icon: Boxes, color: "#4dd2ff" },
  { key: "brand_voice", label: "Brand voice", icon: MessageSquareQuote, color: "#ff8a4c" },
  { key: "faq", label: "FAQ", icon: HelpCircle, color: "#b894ff" },
  { key: "policies", label: "Policies", icon: ScrollText, color: "#ff6b9d" },
  { key: "other", label: "Other", icon: Sparkles, color: "#d8c4b0" },
] as const;

type Category = (typeof CATEGORIES)[number]["key"];

function catMeta(key: string): { label: string; icon: LucideIcon; color: string } {
  const c = CATEGORIES.find((x) => x.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
  return { label: c.label, icon: c.icon, color: c.color };
}

interface KnowledgeEntry {
  id: string;
  category: Category;
  title: string;
  content: string;
  updated_at: string;
}

// Stable radial layout: every node gets an angle (evenly spread, with a
// per-id jitter so equal counts don't look mechanical) and a radius
// banded by index so they don't all sit on one ring.
function layout(entries: KnowledgeEntry[]) {
  const n = entries.length || 1;
  return entries.map((e, i) => {
    // Deterministic pseudo-random from the id so positions are stable
    // across renders (no jumping on every state change).
    let h = 0;
    for (let k = 0; k < e.id.length; k++) h = (h * 31 + e.id.charCodeAt(k)) >>> 0;
    const jitter = ((h % 1000) / 1000 - 0.5) * 0.5; // ±0.25 rad
    const angle = (i / n) * Math.PI * 2 + jitter - Math.PI / 2;
    const ring = 0.62 + ((h >> 3) % 3) * 0.13; // 0.62 / 0.75 / 0.88 of half-extent
    const driftPhase = (h % 628) / 100; // 0..2π for the float animation
    return { entry: e, angle, ring, driftPhase, hash: h };
  });
}

// Faded placeholder nodes for the empty state, so the constellation
// still reads as a "web" before any real memories exist (matches the
// reference's dim ghost graph). Fixed positions; just decoration.
const GHOST_NODES = Array.from({ length: 9 }).map((_, i) => {
  const angle = (i / 9) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.18 : -0.12);
  const ring = 0.6 + (i % 3) * 0.14;
  const driftPhase = (i * 0.7) % (Math.PI * 2);
  return { id: `ghost-${i}`, angle, ring, driftPhase };
});

export function MemoryConstellation({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<KnowledgeEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<KnowledgeEntry | null>(null);
  // Vendor logo shown in the central hub (falls back to the brand mark).
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Add / edit form state.
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState("");
  const [addCategory, setAddCategory] = useState<Category>("other");
  const [saving, setSaving] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("other");
  const [editSaving, setEditSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Gentle drift clock — drives a slow float on every node.
  const [t, setT] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const loop = () => {
      if (!mounted) return;
      setT(performance.now() / 1000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("my_space_knowledge")
      .select("id, category, title, content, updated_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      console.error("[MemoryConstellation] load failed", error);
      toast.error("Couldn't load your memories.");
      return;
    }
    setEntries((data ?? []) as KnowledgeEntry[]);
  }, [user?.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Pull the vendor's logo for the central hub. Best-effort.
  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select("logo_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setLogoUrl((data as { logo_url?: string | null } | null)?.logo_url ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  // Esc closes whatever's topmost (detail → add → overlay).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) setSelected(null);
      else if (adding) setAdding(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, adding, onClose]);

  const nodes = useMemo(() => layout(entries ?? []), [entries]);

  // ── Long-press drag ──────────────────────────────────────────────
  // Per-node position overrides (in vmin offsets from canvas center).
  // Once a node is dragged it stays where it's dropped and its orbit
  // drift is frozen. Positions reset when the overlay is reopened.
  const [overrides, setOverrides] = useState<Record<string, { rx: number; ry: number }>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const movedRef = useRef(false);
  // vmin in px — needed to convert pointer pixels → vmin offsets.
  const vminPx = () =>
    Math.min(window.innerWidth, window.innerHeight) / 100 || 1;

  // Resting orbit position (vmin offset) for a node at time t.
  const orbitPos = useCallback(
    (angle: number, ring: number, driftPhase: number) => {
      const drift = Math.sin(t * 0.5 + driftPhase) * 10;
      return {
        rx: Math.cos(angle) * (ring * 38) + (drift * Math.cos(angle)) / 38,
        ry: Math.sin(angle) * (ring * 38) + (drift * Math.sin(angle)) / 38,
      };
    },
    [t],
  );

  const posFor = useCallback(
    (id: string, angle: number, ring: number, driftPhase: number) =>
      overrides[id] ?? orbitPos(angle, ring, driftPhase),
    [overrides, orbitPos],
  );

  // Pointer → vmin offset from canvas center.
  const pointerToVmin = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current;
    const rect = el?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const u = vminPx();
    return { rx: (clientX - cx) / u, ry: (clientY - cy) / u };
  }, []);

  // Begin a long-press: after the hold delay, enter drag mode for this
  // node. A move before the timer fires cancels it (treated as a tap →
  // opens detail via onClick).
  const startPress = (id: string, e: React.PointerEvent) => {
    movedRef.current = false;
    const pointerId = e.pointerId;
    const target = e.currentTarget as HTMLElement;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      setDraggingId(id);
      try {
        target.setPointerCapture(pointerId);
      } catch {
        /* capture best-effort */
      }
      if (navigator.vibrate) navigator.vibrate(8);
    }, 320);
  };

  const onPressMove = (id: string, e: React.PointerEvent) => {
    if (draggingId !== id) {
      // Moved before long-press fired — cancel the would-be drag.
      if (pressTimer.current) {
        window.clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
      return;
    }
    movedRef.current = true;
    const { rx, ry } = pointerToVmin(e.clientX, e.clientY);
    setOverrides((prev) => ({ ...prev, [id]: { rx, ry } }));
  };

  const endPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    setDraggingId(null);
  };

  // Reset positions whenever the overlay closes so it re-springs fresh.
  useEffect(() => {
    if (!open) {
      setOverrides({});
      setDraggingId(null);
    }
  }, [open]);

  const handleAdd = async () => {
    if (!user?.id) return;
    const content = addText.trim();
    if (!content) return;
    setSaving(true);
    // Title is a short lead-in derived from the memory text; the AI
    // mostly reads `content`, the title is just a node label.
    const title = content.length > 48 ? `${content.slice(0, 46)}…` : content;
    const { error } = await supabase.from("my_space_knowledge").insert({
      user_id: user.id,
      category: addCategory,
      title: title.slice(0, 200),
      content: content.slice(0, 4000),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Memory saved.");
    setAddText("");
    setAddCategory("other");
    setAdding(false);
    void load();
  };

  const openDetail = (entry: KnowledgeEntry) => {
    setSelected(entry);
    setEditMode(false);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditCategory(entry.category);
  };

  const handleSaveEdit = async () => {
    if (!user?.id || !selected) return;
    const title = editTitle.trim();
    const content = editContent.trim();
    if (!title || !content) {
      toast.error("Title and content are required.");
      return;
    }
    setEditSaving(true);
    const { error } = await supabase
      .from("my_space_knowledge")
      .update({
        title: title.slice(0, 200),
        content: content.slice(0, 4000),
        category: editCategory,
      })
      .eq("id", selected.id)
      .eq("user_id", user.id);
    setEditSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Updated.");
    setSelected(null);
    void load();
  };

  const handleDelete = async () => {
    if (!user?.id || !selected) return;
    if (!window.confirm(`Forget "${selected.title}"? The AI will no longer use this.`)) {
      return;
    }
    const { error } = await supabase
      .from("my_space_knowledge")
      .delete()
      .eq("id", selected.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Forgotten.");
    setSelected(null);
    void load();
  };

  if (!open) return null;

  const count = entries?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-[60] overflow-hidden"
      style={{ background: "#0a0a0b" }}
      role="dialog"
      aria-modal="true"
      aria-label="Memory constellation"
    >
      {/* Starfield dot texture. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.5] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      {/* Soft center glow. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(255,138,76,0.12) 0%, transparent 65%)",
        }}
      />

      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-5 right-5 z-20 w-9 h-9 rounded-full inline-flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Title block, top-center. */}
      <div className="absolute left-1/2 top-[12%] -translate-x-1/2 text-center z-10 pointer-events-none">
        <h2 className="text-white font-semibold text-xl tracking-tight">
          Supercomputer memory
        </h2>
        <p className="text-white/45 text-sm mt-0.5">
          {loading
            ? "Loading…"
            : count === 0
              ? "Learning from every chat"
              : `${count} ${count === 1 ? "memory" : "memories"} · applied on every chat`}
        </p>
      </div>

      {/* Constellation canvas. */}
      <div ref={canvasRef} className="absolute inset-0">
        {/* SVG layer for the connecting lines (behind the node chips). */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          {nodes.map(({ entry, angle, ring, driftPhase }) => {
            const { rx, ry } = posFor(entry.id, angle, ring, driftPhase);
            const x = `calc(50% + ${rx}vmin)`;
            const y = `calc(50% + ${ry}vmin)`;
            return (
              <line
                key={entry.id}
                x1="50%"
                y1="50%"
                x2={x}
                y2={y}
                stroke="rgba(255,255,255,0.14)"
                strokeWidth={1}
              />
            );
          })}
          {/* Ghost lines — only when there are no real memories. */}
          {!loading && count === 0
            ? GHOST_NODES.map(({ id, angle, ring, driftPhase }) => {
                const drift = Math.sin(t * 0.5 + driftPhase) * 10;
                const rx = Math.cos(angle) * (ring * 38) + (drift * Math.cos(angle)) / 38;
                const ry = Math.sin(angle) * (ring * 38) + (drift * Math.sin(angle)) / 38;
                return (
                  <line
                    key={id}
                    x1="50%"
                    y1="50%"
                    x2={`calc(50% + ${rx}vmin)`}
                    y2={`calc(50% + ${ry}vmin)`}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={1}
                  />
                );
              })
            : null}
        </svg>

        {/* Central hub — the vendor's logo (falls back to brand mark). */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div
            className="w-16 h-16 rounded-full inline-flex items-center justify-center overflow-hidden"
            style={{
              background: logoUrl ? "#fff" : "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 0 40px rgba(255,138,76,0.22)",
            }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Your logo"
                className="w-full h-full object-cover"
              />
            ) : (
              <VendoraMark size={30} color="#ff8a4c" />
            )}
          </div>
        </div>

        {/* Memory nodes. */}
        {nodes.map(({ entry, angle, ring, driftPhase }) => {
          const meta = catMeta(entry.category);
          const Icon = meta.icon;
          const { rx, ry } = posFor(entry.id, angle, ring, driftPhase);
          const isDragging = draggingId === entry.id;
          // Label sits just outside the node, pushed further from center.
          const labelOutside = rx >= 0;
          return (
            <div
              key={entry.id}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `calc(50% + ${rx}vmin)`,
                top: `calc(50% + ${ry}vmin)`,
                zIndex: isDragging ? 40 : 10,
                touchAction: "none",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  // Suppress the click that ends a drag — only a real tap
                  // (no long-press drag) opens the detail card.
                  if (movedRef.current) {
                    movedRef.current = false;
                    return;
                  }
                  openDetail(entry);
                }}
                onPointerDown={(e) => startPress(entry.id, e)}
                onPointerMove={(e) => onPressMove(entry.id, e)}
                onPointerUp={endPress}
                onPointerCancel={endPress}
                className="group relative flex items-center gap-2 select-none"
                style={{
                  flexDirection: labelOutside ? "row" : "row-reverse",
                  cursor: isDragging ? "grabbing" : "pointer",
                }}
                title={entry.title}
              >
                <span
                  className={`w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 transition-transform ${
                    isDragging ? "scale-125" : "group-hover:scale-110"
                  }`}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${meta.color}${isDragging ? "cc" : "66"}`,
                    boxShadow: `0 0 ${isDragging ? "28px" : "16px"} ${meta.color}${isDragging ? "55" : "22"}`,
                  }}
                >
                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                </span>
                <span
                  className="max-w-[160px] truncate text-xs text-white/55 group-hover:text-white/90 transition-colors px-2 py-1 rounded-md"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  {entry.title}
                </span>
              </button>
            </div>
          );
        })}

        {/* Ghost node chips — faded placeholders so the constellation
            still reads as a web before any real memories exist. */}
        {!loading && count === 0
          ? GHOST_NODES.map(({ id, angle, ring, driftPhase }) => {
              const drift = Math.sin(t * 0.5 + driftPhase) * 10;
              const rx = Math.cos(angle) * (ring * 38) + (drift * Math.cos(angle)) / 38;
              const ry = Math.sin(angle) * (ring * 38) + (drift * Math.sin(angle)) / 38;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAdding(true)}
                  title="Add a memory"
                  className="group absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `calc(50% + ${rx}vmin)`,
                    top: `calc(50% + ${ry}vmin)`,
                  }}
                >
                  <span
                    className="w-8 h-8 rounded-full inline-flex items-center justify-center transition-all group-hover:scale-110"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 text-white/25 group-hover:text-[#ff8a4c] transition-colors" />
                  </span>
                </button>
              );
            })
          : null}

        {/* Empty-state hint, low enough not to collide with the nodes. */}
        {!loading && count === 0 ? (
          <div className="absolute left-1/2 top-[80%] -translate-x-1/2 text-center px-6 max-w-sm">
            <p className="text-white/45 text-sm leading-relaxed">
              No memories yet. Add one below, or tell My Space in chat —
              <span className="text-white/70"> "remember that my hourly rate is $150"</span> —
              and it lands here automatically.
            </p>
          </div>
        ) : null}
      </div>

      {/* Add-a-memory pill (bottom-center). */}
      <div className="absolute left-1/2 bottom-8 -translate-x-1/2 z-20 w-full max-w-md px-4">
        {adding ? (
          <div
            className="rounded-2xl p-3 space-y-2.5"
            style={{
              background: "rgba(24,24,27,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
            }}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              {CATEGORIES.map((c) => {
                const active = c.key === addCategory;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setAddCategory(c.key)}
                    className="text-[11px] px-2 py-1 rounded-full transition-colors"
                    style={{
                      background: active ? `${c.color}26` : "rgba(255,255,255,0.05)",
                      color: active ? c.color : "rgba(255,255,255,0.55)",
                      border: `1px solid ${active ? `${c.color}66` : "transparent"}`,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              autoFocus
              rows={2}
              maxLength={4000}
              placeholder='e.g. "My hourly rate is $150 for events under 4 hours"'
              className="w-full resize-none bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setAddText("");
                }}
                className="text-xs text-white/55 hover:text-white px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving || !addText.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3.5 py-1.5 disabled:opacity-50"
                style={{ background: "#ff8a4c", color: "#0a0a0b" }}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Remember this
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-between gap-3 rounded-full pl-5 pr-2 py-2.5 transition-colors"
            style={{
              background: "rgba(24,24,27,0.92)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            }}
          >
            <span className="text-sm text-white/50">Add a memory</span>
            <span
              className="w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0"
              style={{ background: "#ff8a4c", color: "#0a0a0b" }}
            >
              <ArrowUp className="w-4 h-4" />
            </span>
          </button>
        )}
      </div>

      {/* Detail / edit card for a selected node. */}
      {selected ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{
              background: "rgba(24,24,27,0.98)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 16px 64px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const meta = catMeta(editMode ? editCategory : selected.category);
              const Icon = meta.icon;
              return (
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-8 h-8 rounded-full inline-flex items-center justify-center"
                    style={{ background: `${meta.color}1a`, border: `1px solid ${meta.color}55` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: meta.color }} />
                  </span>
                  <span className="text-xs uppercase tracking-wide" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="ml-auto text-white/45 hover:text-white"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })()}

            {editMode ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {CATEGORIES.map((c) => {
                    const active = c.key === editCategory;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setEditCategory(c.key)}
                        className="text-[11px] px-2 py-1 rounded-full"
                        style={{
                          background: active ? `${c.color}26` : "rgba(255,255,255,0.05)",
                          color: active ? c.color : "rgba(255,255,255,0.55)",
                          border: `1px solid ${active ? `${c.color}66` : "transparent"}`,
                        }}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  className="w-full text-sm font-medium rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-white outline-none"
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  maxLength={4000}
                  rows={4}
                  className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-white outline-none resize-y"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="text-xs text-white/55 hover:text-white px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={editSaving}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3.5 py-1.5 disabled:opacity-50"
                    style={{ background: "#ff8a4c", color: "#0a0a0b" }}
                  >
                    {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-white font-medium text-base leading-snug">
                  {selected.title}
                </h3>
                <p className="mt-2 text-sm text-white/65 whitespace-pre-wrap break-words leading-relaxed">
                  {selected.content}
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-red-400 px-3 py-1.5 rounded-full hover:bg-white/5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Forget
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
