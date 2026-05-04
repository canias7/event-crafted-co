import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  ShieldCheck,
  ShieldX,
  EyeOff,
  Eye,
  CheckCircle2,
  Sparkles,
  History,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminNavItems as navItems } from "@/data/navItems";

interface AuditRow {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  admin: { display_name: string | null } | null;
}

const actionMeta: Record<
  string,
  { label: string; tone: string; Icon: typeof ShieldCheck }
> = {
  vendor_verified: {
    label: "Vendor verified",
    tone: "text-accent",
    Icon: ShieldCheck,
  },
  vendor_unverified: {
    label: "Vendor unverified",
    tone: "text-destructive",
    Icon: ShieldX,
  },
  verification_approved: {
    label: "Verification approved",
    tone: "text-accent",
    Icon: CheckCircle2,
  },
  verification_rejected: {
    label: "Verification rejected",
    tone: "text-destructive",
    Icon: ShieldX,
  },
  review_hidden: { label: "Review hidden", tone: "text-destructive", Icon: EyeOff },
  review_unhidden: { label: "Review unhidden", tone: "text-foreground", Icon: Eye },
  support_ticket_open: { label: "Ticket reopened", tone: "text-foreground", Icon: History },
  support_ticket_in_progress: { label: "Ticket in progress", tone: "text-foreground", Icon: History },
  support_ticket_resolved: { label: "Ticket resolved", tone: "text-accent", Icon: CheckCircle2 },
  support_ticket_closed: { label: "Ticket closed", tone: "text-muted-foreground", Icon: History },
};

function meta(action: string) {
  return (
    actionMeta[action] ?? {
      label: action.replace(/_/g, " "),
      tone: "text-foreground",
      Icon: Sparkles,
    }
  );
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("admin_audit_log")
      .select(
        "id, admin_id, action, target_type, target_id, summary, metadata, created_at, admin:profiles!admin_audit_log_admin_id_fkey(display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data as AuditRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.action.toLowerCase().includes(q) ||
        r.target_type.toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q) ||
        (r.admin?.display_name ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Every admin action that touched another user's data
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by action, target, summary, or admin name"
              className="h-11 pl-10 rounded-full bg-secondary/80 border-none"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 rounded-sm" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <History className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-display text-xl mb-1">
                {rows.length === 0 ? "No admin actions yet" : "No matches"}
              </p>
              <p className="text-sm text-muted-foreground">
                Verifications, review moderation, ticket changes, and
                vendor onboarding actions show up here.
              </p>
            </div>
          ) : (
            <ul className="rounded-sm border border-border bg-card divide-y divide-border">
              {filtered.map((r) => {
                const m = meta(r.action);
                const Icon = m.Icon;
                return (
                  <li key={r.id} className="p-4 flex items-start gap-3">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${m.tone}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <p className="text-sm font-medium leading-tight">
                          {m.label}
                          {r.summary && (
                            <span className="text-muted-foreground font-normal">
                              {" — "}
                              {r.summary}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground tnum shrink-0">
                          {new Date(r.created_at).toLocaleString()}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        by{" "}
                        <span className="text-foreground/80">
                          {r.admin?.display_name ?? "(deleted admin)"}
                        </span>
                        {" · "}
                        <span className="capitalize">
                          {r.target_type.replace(/_/g, " ")}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
