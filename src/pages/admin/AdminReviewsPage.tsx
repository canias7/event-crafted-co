import { useEffect, useMemo, useState } from "react";
import { Search, EyeOff, Eye, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminNavItems as navItems } from "@/data/navItems";

const reviewsTable = () => supabase.from("reviews");

interface ReviewRow {
  id: string;
  rating: number;
  body: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
  vendor: { business_name: string | null } | null;
  host: { display_name: string | null } | null;
}

export default function AdminReviewsPage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await reviewsTable()
      .select(
        "id, rating, body, hidden_at, hidden_reason, created_at, vendor:vendor_profiles!reviews_vendor_id_fkey(business_name), host:profiles!reviews_host_id_fkey(display_name)",
      )
      .order("created_at", { ascending: false });
    setRows((data as ReviewRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleHidden(r: ReviewRow) {
    setPendingId(r.id);
    const next = r.hidden_at
      ? { hidden_at: null, hidden_reason: null }
      : { hidden_at: new Date().toISOString(), hidden_reason: "Hidden by admin" };
    const { error } = await reviewsTable().update(next).eq("id", r.id);
    setPendingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) =>
      prev.map((x) =>
        x.id === r.id ? { ...x, hidden_at: next.hidden_at, hidden_reason: next.hidden_reason } : x,
      ),
    );
    toast.success(next.hidden_at ? "Review hidden" : "Review restored");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "visible" && r.hidden_at) return false;
      if (filter === "hidden" && !r.hidden_at) return false;
      if (!q) return true;
      return (
        (r.body ?? "").toLowerCase().includes(q) ||
        (r.vendor?.business_name ?? "").toLowerCase().includes(q) ||
        (r.host?.display_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  const filterChips: Array<{ value: typeof filter; label: string; count: number }> = [
    { value: "all", label: "All", count: rows.length },
    { value: "visible", label: "Visible", count: rows.filter((r) => !r.hidden_at).length },
    { value: "hidden", label: "Hidden", count: rows.filter((r) => r.hidden_at).length },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Reviews</h1>
          <p className="text-sm text-muted-foreground">
            Moderate hidden reviews — they stay visible to author and vendor only.
          </p>
        </div>

        <div className="p-4 md:p-8 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by body, vendor, or host"
                className="h-11 pl-10 rounded-full bg-secondary/80 border-none"
              />
            </div>
            <div className="flex gap-2">
              {filterChips.map((c) => (
                <Button
                  key={c.value}
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilter(c.value)}
                  className={`rounded-full whitespace-nowrap h-9 text-xs ${
                    filter === c.value
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.label}
                  <span className="ml-2 tnum opacity-70">{c.count}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-sm overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 px-6">
                <p className="font-display text-xl mb-2">
                  {rows.length === 0 ? "No reviews yet" : "Nothing matches"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((r) => (
                  <div key={r.id} className="p-5 flex flex-col md:flex-row gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: r.rating }).map((_, i) => (
                            <Star
                              key={i}
                              className="w-3.5 h-3.5 fill-accent text-accent"
                            />
                          ))}
                        </div>
                        <span className="text-sm font-medium">
                          {r.host?.display_name ?? "Anonymous"} →{" "}
                          {r.vendor?.business_name ?? "Vendor"}
                        </span>
                        {r.hidden_at && (
                          <Badge
                            variant="outline"
                            className="bg-muted text-muted-foreground border-border"
                          >
                            <EyeOff className="w-3 h-3 mr-1" />
                            Hidden
                          </Badge>
                        )}
                      </div>
                      {r.body ? (
                        <p className="text-sm leading-relaxed text-foreground/85">
                          "{r.body}"
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No written feedback.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground tnum mt-2">
                        {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex md:flex-col items-start gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs rounded-full"
                        disabled={pendingId === r.id}
                        onClick={() => toggleHidden(r)}
                      >
                        {pendingId === r.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : r.hidden_at ? (
                          <Eye className="w-3 h-3 mr-1" />
                        ) : (
                          <EyeOff className="w-3 h-3 mr-1" />
                        )}
                        {r.hidden_at ? "Restore" : "Hide"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
