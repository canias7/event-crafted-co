import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  ArrowRight,
  Trash2,
  Loader2,
  Bell,
  BellOff,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { customerNavItems as navItems } from "@/data/navItems";

interface SavedSearch {
  id: string;
  name: string;
  filters: { _version?: number; q?: string; category?: string };
  notify_new_matches: boolean;
  email_alerts_enabled: boolean;
  created_at: string;
}

function buildBrowseHref(filters: SavedSearch["filters"]) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category && filters.category !== "All")
    params.set("category", filters.category);
  const qs = params.toString();
  return qs ? `/vendors?${qs}` : "/vendors";
}

function summarize(filters: SavedSearch["filters"]) {
  const parts: string[] = [];
  if (filters.category && filters.category !== "All") parts.push(filters.category);
  if (filters.q) parts.push(`"${filters.q}"`);
  return parts.length > 0 ? parts.join(" · ") : "All vendors";
}

export default function SavedSearchesPage() {
  const { user } = useAuth();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("saved_searches")
      .select("id, name, filters, notify_new_matches, email_alerts_enabled, created_at")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false });
    setSearches((data as SavedSearch[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function toggleNotify(s: SavedSearch, next: boolean) {
    setSearches((prev) =>
      prev.map((p) =>
        p.id === s.id ? { ...p, notify_new_matches: next } : p,
      ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("saved_searches")
      .update({ notify_new_matches: next })
      .eq("id", s.id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function toggleEmail(s: SavedSearch, next: boolean) {
    setSearches((prev) =>
      prev.map((p) =>
        p.id === s.id ? { ...p, email_alerts_enabled: next } : p,
      ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("saved_searches")
      .update({ email_alerts_enabled: next })
      .eq("id", s.id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function deleteSearch(id: string) {
    setPendingId(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("saved_searches")
      .delete()
      .eq("id", id);
    setPendingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSearches((prev) => prev.filter((p) => p.id !== id));
    toast.success("Search deleted");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Saved searches</h1>
          <p className="text-sm text-muted-foreground">
            Re-run vendor filters in one click; we'll ping you when new
            vendors match
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading…
            </div>
          ) : searches.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <Bookmark className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl mb-2">No saved searches</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Browse vendors with a filter active (category, keyword), then
                tap "Save search" to pin the query here.
              </p>
              <Link to="/vendors">
                <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                  Browse vendors
                  <ArrowRight className="w-3.5 h-3.5 ml-2" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {searches.map((s) => (
                <div
                  key={s.id}
                  className="rounded-sm border border-border bg-card p-5"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div className="min-w-0">
                      <p className="font-display text-base mb-1">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {summarize(s.filters)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link to={buildBrowseHref(s.filters)}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full h-8 text-xs"
                        >
                          Run
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={pendingId === s.id}
                        onClick={() => deleteSearch(s.id)}
                        aria-label="Delete saved search"
                      >
                        {pendingId === s.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2 text-xs">
                      {s.notify_new_matches ? (
                        <Bell className="w-3.5 h-3.5 text-accent" />
                      ) : (
                        <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <span className="text-muted-foreground">In-app alerts</span>
                    </div>
                    <Switch
                      checked={s.notify_new_matches}
                      onCheckedChange={(v) => toggleNotify(s, v)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2 text-xs">
                      <Bell className={`w-3.5 h-3.5 ${
                        s.email_alerts_enabled
                          ? "text-accent"
                          : "text-muted-foreground"
                      }`} />
                      <span className="text-muted-foreground">
                        Email alerts
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                          opt-in
                        </span>
                      </span>
                    </div>
                    <Switch
                      checked={s.email_alerts_enabled}
                      disabled={!s.notify_new_matches}
                      onCheckedChange={(v) => toggleEmail(s, v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
