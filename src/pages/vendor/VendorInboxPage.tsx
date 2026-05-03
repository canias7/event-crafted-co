import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

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
}

function fmtMoney(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString()}`;
}

const statusVariant: Record<string, string> = {
  new: "bg-accent text-accent-foreground",
  drafted: "bg-secondary text-secondary-foreground",
  replied: "bg-primary text-primary-foreground",
  won: "bg-accent text-accent-foreground",
  lost: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

function exportInquiriesCsv(rows: InquiryRow[]) {
  if (rows.length === 0) {
    toast.error("Nothing to export yet");
    return;
  }
  const headers = ["host", "event_type", "event_date", "budget_min", "budget_max", "status", "quality", "received"];
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      escape(r.host?.display_name ?? ""),
      escape(r.event_type),
      r.event_date ?? "",
      r.budget_min_cents != null ? (r.budget_min_cents / 100).toFixed(0) : "",
      r.budget_max_cents != null ? (r.budget_max_cents / 100).toFixed(0) : "",
      r.status,
      r.quality_score?.toString() ?? "",
      new Date(r.created_at).toISOString().slice(0, 10),
    ].join(","),
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendora-inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("Inquiries exported");
}

const filterOptions: Array<{ value: string; label: string; matches: (status: string) => boolean }> = [
  { value: "all", label: "All", matches: () => true },
  { value: "new", label: "New", matches: (s) => s === "new" || s === "drafted" },
  { value: "replied", label: "Replied", matches: (s) => s === "replied" },
  { value: "won", label: "Booked", matches: (s) => s === "won" },
  { value: "lost", label: "Closed", matches: (s) => s === "lost" || s === "expired" },
];

export default function VendorInboxPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

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
    setRows((data as unknown as InquiryRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: vp } = await supabase
        .from("vendor_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!vp) {
        setRows([]);
        setLoading(false);
        return;
      }
      setVendorId(vp.id);
      await load(vp.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    const matcher = filterOptions.find((o) => o.value === filter)?.matches;
    return matcher ? rows.filter((r) => matcher(r.status)) : rows;
  }, [rows, filter]);

  // Realtime: refetch when any inquiry for this vendor changes.
  useEffect(() => {
    if (!vendorId) return;
    const channel = supabase
      .channel(`vendor-inbox-${vendorId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inquiries",
          filter: `vendor_id=eq.${vendorId}`,
        },
        () => load(vendorId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl">Inbox</h1>
            <p className="text-sm text-muted-foreground">All inquiries from hosts</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length === 0}
            onClick={() => exportInquiriesCsv(rows)}
            className="rounded-full"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>

        <div className="p-4 md:p-8">
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

          <div className="bg-card rounded-2xl card-shadow overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground">Loading inquiries…</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-16 text-center">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-display text-xl mb-1">
                  {rows.length === 0
                    ? "No inquiries yet"
                    : "Nothing matches that filter"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "When hosts reach out, you'll see them here."
                    : "Try a different status filter above."}
                </p>
              </div>
            ) : (
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
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}