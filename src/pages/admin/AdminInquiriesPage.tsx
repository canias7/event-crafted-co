import { useEffect, useMemo, useState } from "react";
import { Search, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminNavItems as navItems } from "@/data/navItems";

interface InquiryRow {
  id: string;
  event_type: string;
  event_date: string | null;
  status: string;
  created_at: string;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  vendor: { business_name: string | null; category: string | null } | null;
  host: { display_name: string | null } | null;
}

const statusStyles: Record<string, string> = {
  new: "bg-accent/15 text-accent border-accent/30",
  drafted: "bg-secondary text-secondary-foreground border-border",
  replied: "bg-foreground text-background border-foreground",
  won: "bg-accent text-accent-foreground border-accent",
  lost: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

const filters = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "replied", label: "Replied" },
  { value: "won", label: "Booked" },
  { value: "lost", label: "Closed" },
];

function fmtMoney(c: number | null) {
  return c == null ? "—" : `$${(c / 100).toLocaleString()}`;
}

export default function AdminInquiriesPage() {
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("inquiries")
      .select(
        "id, event_type, event_date, status, created_at, budget_min_cents, budget_max_cents, vendor:vendor_profiles!inquiries_vendor_id_fkey(business_name, category), host:profiles!inquiries_host_id_fkey(display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data as unknown as InquiryRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return (
        (r.vendor?.business_name ?? "").toLowerCase().includes(q) ||
        (r.host?.display_name ?? "").toLowerCase().includes(q) ||
        r.event_type.toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Inquiries</h1>
          <p className="text-sm text-muted-foreground">
            Cross-platform browser of every inquiry
          </p>
        </div>

        <div className="p-4 md:p-8 space-y-4">
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by host, vendor, or event type"
                className="h-11 pl-10 rounded-full bg-secondary/80 border-none"
              />
            </div>
            <div className="flex gap-2">
              {filters.map((f) => {
                const count =
                  f.value === "all"
                    ? rows.length
                    : rows.filter((r) => r.status === f.value).length;
                return (
                  <Button
                    key={f.value}
                    size="sm"
                    variant="ghost"
                    onClick={() => setFilter(f.value)}
                    className={`rounded-full whitespace-nowrap h-9 text-xs ${
                      filter === f.value
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                    <span className="ml-2 tnum opacity-70">{count}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="bg-card border border-border rounded-sm overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 px-6">
                <Clock className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-display text-xl mb-2">
                  {rows.length === 0 ? "No inquiries yet" : "Nothing matches"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">Host</th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">Vendor</th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">Event</th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">Date</th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">Budget</th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">Status</th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="py-3 px-5 font-medium">
                          {r.host?.display_name ?? "—"}
                        </td>
                        <td className="py-3 px-5">
                          <p className="font-medium">{r.vendor?.business_name ?? "—"}</p>
                          {r.vendor?.category && (
                            <p className="text-xs text-muted-foreground">
                              {r.vendor.category}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-5 capitalize text-muted-foreground">
                          {r.event_type.replace("_", " ")}
                        </td>
                        <td className="py-3 px-5 tnum text-muted-foreground">
                          {r.event_date ?? "—"}
                        </td>
                        <td className="py-3 px-5 tnum text-muted-foreground">
                          {fmtMoney(r.budget_min_cents)} – {fmtMoney(r.budget_max_cents)}
                        </td>
                        <td className="py-3 px-5">
                          <Badge variant="outline" className={statusStyles[r.status] ?? ""}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-5 tnum text-muted-foreground">
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
