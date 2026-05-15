import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, Search } from "lucide-react";
import { toast } from "sonner";
import { useRealtime } from "@/lib/realtime";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { vendorNavItems as navItems } from "@/data/navItems";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { VENDOR_INBOX_HUB_TABS } from "@/data/hubTabs";

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

interface VendorLabel {
  id: string;
  name: string;
  color: string;
  display_order: number;
}

function fmtMoney(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString()}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const statusVariant: Record<string, string> = {
  new: "bg-accent text-accent-foreground",
  drafted: "bg-secondary text-secondary-foreground",
  replied: "bg-primary text-primary-foreground",
  won: "bg-accent text-accent-foreground",
  lost: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

const filterOptions: Array<{ value: string; label: string; matches: (status: string) => boolean }> = [
  { value: "all", label: "All", matches: () => true },
  { value: "new", label: "New", matches: (s) => s === "new" || s === "drafted" },
  { value: "replied", label: "Replied", matches: (s) => s === "replied" },
  { value: "won", label: "Booked", matches: (s) => s === "won" },
  { value: "lost", label: "Closed", matches: (s) => s === "lost" || s === "expired" },
];

export default function VendorInboxPage() {
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [labels, setLabels] = useState<VendorLabel[]>([]);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  async function load(forVendorId?: string | null) {
    const vid = forVendorId ?? vendorId;
    if (!vid) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("inquiries")
      .select(
        "id,event_type,event_date,budget_min_cents,budget_max_cents,status,quality_score,created_at,host:profiles!inquiries_host_id_fkey(display_name)",
      )
      .eq("vendor_id", vid)
      .order("created_at", { ascending: false });
    const inquiries = (data as unknown as InquiryRow[]) ?? [];

    // Hydrate label assignments per inquiry
    if (inquiries.length > 0) {
      const { data: assigns } = await supabase
        .from("inquiry_label_assignments")
        .select(
          "inquiry_id, label:vendor_inquiry_labels!inquiry_label_assignments_label_id_fkey(id, name, color)",
        )
        .in(
          "inquiry_id",
          inquiries.map((i) => i.id),
        );
      const byInq = new Map<string, InquiryRow["labels"]>();
      for (const a of (assigns ?? []) as Array<{
        inquiry_id: string;
        label: { id: string; name: string; color: string } | null;
      }>) {
        if (!a.label) continue;
        if (!byInq.has(a.inquiry_id)) byInq.set(a.inquiry_id, []);
        byInq.get(a.inquiry_id)!.push(a.label);
      }
      for (const i of inquiries) i.labels = byInq.get(i.id) ?? [];
    }
    setRows(inquiries);
    setLoading(false);
  }

  async function loadLabels(forVendorId?: string | null) {
    const vid = forVendorId ?? vendorId;
    if (!vid) return;
    const { data } = await supabase
      .from("vendor_inquiry_labels")
      .select("id, name, color, display_order")
      .eq("vendor_id", vid)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    setLabels((data as VendorLabel[]) ?? []);
  }

  useEffect(() => {
    if (!user) return;
    if (!vendorId) {
      setRows([]);
      setLoading(false);
      return;
    }
    load(vendorId);
    loadLabels(vendorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorId]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (filter !== "all") {
      const matcher = filterOptions.find((o) => o.value === filter)?.matches;
      if (matcher) result = result.filter((r) => matcher(r.status));
    }
    if (labelFilter) {
      result = result.filter((r) =>
        (r.labels ?? []).some((l) => l.id === labelFilter),
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.host?.display_name?.toLowerCase().includes(q) ||
          r.event_type?.toLowerCase().includes(q) ||
          r.event_date?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, filter, labelFilter, search]);

  // Realtime: refetch when any inquiry for this vendor changes.
  // Realtime via the shared user-scoped channel — no per-page websocket
  // subscription needed.
  const realtimeConfig = useMemo(
    () =>
      vendorId
        ? { table: "inquiries", filter: `vendor_id=eq.${vendorId}` }
        : null,
    [vendorId],
  );
  useRealtime(realtimeConfig, () => {
    if (vendorId) load(vendorId);
  });

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border/40 bg-card/60 backdrop-blur px-4 md:px-8 py-5 sticky top-0 z-40 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-editorial text-3xl">Inbox</h1>
              <p className="text-sm text-muted-foreground">
                Inquiries, host DMs, and partner threads — all in one place
              </p>
            </div>
            <NotificationBell variant="light" />
          </div>
          <SubNavTabs tabs={VENDOR_INBOX_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8">
          <div className="relative max-w-xl mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by host, event type, or date"
              className="pl-9 rounded-full bg-secondary/50 border-transparent focus-visible:ring-1"
            />
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {filterOptions.map((opt) => {
              const count =
                opt.value === "all"
                  ? rows.length
                  : rows.filter((r) => opt.matches(r.status)).length;
              return (
                <Button
                  key={opt.value}
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilter(opt.value)}
                  className={`rounded-full whitespace-nowrap h-8 text-xs ${
                    filter === opt.value
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                  <span className="ml-2 tnum opacity-70">{count}</span>
                </Button>
              );
            })}
          </div>

          {labels.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <span className="text-xs text-muted-foreground">Labels:</span>
              {labels.map((l) => {
                const active = labelFilter === l.id;
                const count = rows.filter((r) =>
                  (r.labels ?? []).some((x) => x.id === l.id),
                ).length;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLabelFilter(active ? null : l.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "border-foreground"
                        : "border-transparent hover:border-border"
                    }`}
                    style={{
                      backgroundColor: active ? l.color : `${l.color}22`,
                      color: active ? "#fff" : l.color,
                    }}
                  >
                    {l.name}
                    <span className="tnum opacity-70">{count}</span>
                  </button>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLabelsOpen(true)}
                className="rounded-full text-xs h-7 ml-auto"
              >
                Manage labels
              </Button>
            </div>
          )}

          {loading ? (
            <div className="bg-card rounded-2xl card-shadow p-12 text-center text-muted-foreground">
              Loading inquiries…
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="bg-card rounded-2xl card-shadow py-20 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
                <Inbox className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-display text-xl">
                {rows.length === 0
                  ? "No inquiries yet"
                  : "Nothing matches that filter"}
              </p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl card-shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-4 font-label text-muted-foreground">Host</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Event</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Date</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Budget</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Status</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Quality</th>
                      <th className="text-left p-4 font-label text-muted-foreground">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/40 cursor-pointer">
                        <td className="p-4">
                          <Link to={`/vendor/inbox/${r.id}`} className="font-medium block">
                            {r.host?.display_name ?? "Unknown host"}
                          </Link>
                          {(r.labels ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(r.labels ?? []).map((l) => (
                                <span
                                  key={l.id}
                                  className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium"
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
                        </td>
                        <td className="p-4 capitalize text-muted-foreground">{r.event_type.replace("_", " ")}</td>
                        <td className="p-4 tnum text-muted-foreground">{r.event_date ?? "—"}</td>
                        <td className="p-4 tnum text-muted-foreground">
                          {fmtMoney(r.budget_min_cents)} – {fmtMoney(r.budget_max_cents)}
                        </td>
                        <td className="p-4">
                          <Badge className={statusVariant[r.status] ?? ""}>{r.status}</Badge>
                        </td>
                        <td className="p-4 tnum">{r.quality_score ?? "—"}</td>
                        <td className="p-4 tnum text-muted-foreground">
                          {relativeTime(r.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />

      {vendorId && (
        <ManageLabelsDialog
          open={labelsOpen}
          onOpenChange={setLabelsOpen}
          vendorId={vendorId}
          labels={labels}
          onChanged={() => {
            loadLabels(vendorId);
            load(vendorId);
          }}
        />
      )}
    </div>
  );
}

function ManageLabelsDialog({
  open,
  onOpenChange,
  vendorId,
  labels,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendorId: string;
  labels: VendorLabel[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#a08259");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const PALETTE = [
    "#a08259",
    "#10b981",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#1a1a1a",
  ];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("vendor_inquiry_labels")
      .insert({
        vendor_id: vendorId,
        name: name.trim(),
        color,
        display_order: labels.length,
      });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    onChanged();
  }

  async function remove(id: string) {
    setDeletingId(id);
    const { error } = await supabase
      .from("vendor_inquiry_labels")
      .delete()
      .eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Inbox labels
          </DialogTitle>
          <DialogDescription>
            Custom tags layered on top of inquiry status. Use them for hot
            leads, follow-up, season tags, anything.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {labels.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No labels yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {labels.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-sm border border-border"
                >
                  <span
                    className="inline-block text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: `${l.color}22`,
                      color: l.color,
                    }}
                  >
                    {l.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(l.id)}
                    disabled={deletingId === l.id}
                    aria-label="Delete label"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {deletingId === l.id ? "…" : "×"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form onSubmit={add} className="space-y-3 pt-2 border-t border-border">
          <div className="space-y-1.5">
            <Label htmlFor="label-name" className="text-xs">
              New label
            </Label>
            <input
              id="label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hot lead, Follow up, Out of scope…"
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 ${
                  color === c ? "border-foreground" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !name.trim()}
              className="rounded-full ml-auto"
            >
              Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}