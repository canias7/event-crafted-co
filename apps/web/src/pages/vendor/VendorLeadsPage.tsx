// Vendor Leads — CRM-style aggregate view of every host who has
// inquired with this vendor. Each row collapses all inquiries
// from the same host into one entry showing:
//   • Host display name + avatar
//   • Combined status pill (uses the most-progressed status:
//     won > replied/pending > new > lost)
//   • Last-contact relative time (max(last_message_at) across
//     inquiries)
//   • Total inquiries count
//   • Most recent event type
//   • Cumulative budget range (sum of mid-point budgets across
//     inquiries)
//
// Click any row → routes to the most recent inquiry's chat at
// /vendor/inbox/:id so the vendor can pick up where they left off.
//
// Lives at /vendor/leads and is reachable from the Vendor Portal
// sidebar. Designed as a pure read-only roll-up — no CRUD on the
// leads themselves; updates flow naturally from new inquiries +
// status changes the vendor makes elsewhere.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Filter, Inbox, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/lib/realtime";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  ListingPicker,
  type ListingOpt,
} from "@/components/vendor/ListingPicker";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { vendorNavItems as navItems } from "@/data/navItems";

interface InquiryRow {
  id: string;
  host_id: string;
  event_type: string | null;
  event_date: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  status: string;
  created_at: string;
  last_message_at: string | null;
  host: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface Lead {
  hostId: string;
  hostName: string;
  hostAvatarUrl: string | null;
  inquiriesCount: number;
  status: "won" | "active" | "new" | "lost";
  // The latest inquiry's id — used as the click-through target.
  latestInquiryId: string;
  latestEventType: string | null;
  latestEventDate: string | null;
  lastContactAt: string; // ISO
  budgetTotalCents: number;
}

// Ordered by priority: a host with at least one won inquiry is
// 'won' regardless of any other inquiries they have; otherwise
// any active (replied/drafted) inquiry tags them 'active';
// otherwise 'new' if any inquiry is in the new state; otherwise
// 'lost' (covers both 'lost' and 'expired'). Statuses come from the
// inquiries_status_check constraint: new/drafted/replied/won/lost/expired.
function pickAggregateStatus(statuses: string[]): Lead["status"] {
  if (statuses.includes("won")) return "won";
  if (statuses.some((s) => s === "replied" || s === "drafted")) return "active";
  if (statuses.includes("new")) return "new";
  return "lost";
}

function midBudget(min: number | null, max: number | null): number {
  if (min != null && max != null) return Math.round((min + max) / 2);
  if (min != null) return min;
  if (max != null) return max;
  return 0;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function formatMoney(cents: number): string {
  if (cents <= 0) return "—";
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

type StatusFilter = "all" | "active" | "won" | "lost";

export default function VendorLeadsPage() {
  const { user } = useAuth();

  // Listing picker — scopes the page to ONE of the vendor's listings
  // at a time, mirroring the Calendar page. Pulled directly from
  // vendor_profiles (rather than vendorMemberships) so we get the
  // logo / category / location columns the picker UI needs. Preselects
  // the first APPROVED listing on mount; pending listings render in
  // the dropdown so the vendor sees them but can't pick them.
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null,
  );
  const [listingPickerOpen, setListingPickerOpen] = useState(false);

  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setListingsLoading(true);
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, location, application_status, logo_url",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as ListingOpt[];
      setListings(rows);
      const firstApproved = rows.find(
        (l) => l.application_status === "approved",
      );
      setSelectedListingId((prev) => prev ?? firstApproved?.id ?? null);
      setListingsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user || !selectedListingId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Cap at 200 to match VendorInboxPage's "don't pull every historical
    // inquiry on each load" guard, but a little higher because Leads
    // aggregates by host — a vendor with many repeat customers gains
    // more by seeing more inquiries per page load than the inbox does.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("inquiries")
      .select(
        "id, host_id, event_type, event_date, budget_min_cents, budget_max_cents, status, created_at, last_message_at, host:profiles!inquiries_host_id_fkey(display_name, avatar_url)",
      )
      .eq("vendor_id", selectedListingId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    setRows((data as unknown as InquiryRow[]) ?? []);
    setLoading(false);
  }, [user, selectedListingId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: refetch when an inquiry on THE SELECTED listing changes.
  // Server-side filter keeps us from being woken up by events on the
  // vendor's other listings.
  const realtimeConfig = useMemo(
    () =>
      selectedListingId
        ? { table: "inquiries", filter: `vendor_id=eq.${selectedListingId}` }
        : null,
    [selectedListingId],
  );
  useRealtime(realtimeConfig, () => {
    void load();
  });

  // Roll up inquiries into one Lead per host. Sort by most recent
  // contact (last_message_at falls back to created_at when the
  // inquiry has no messages yet).
  const leads = useMemo<Lead[]>(() => {
    const byHost = new Map<string, InquiryRow[]>();
    // host_id is NOT NULL on inquiries — no defensive null guard needed.
    for (const r of rows) {
      let bucket = byHost.get(r.host_id);
      if (!bucket) {
        bucket = [];
        byHost.set(r.host_id, bucket);
      }
      bucket.push(r);
    }
    const list: Lead[] = [];
    for (const [hostId, hostRows] of byHost) {
      const sorted = hostRows.slice().sort((a, b) => {
        const ta = new Date(a.last_message_at ?? a.created_at).getTime();
        const tb = new Date(b.last_message_at ?? b.created_at).getTime();
        return tb - ta;
      });
      const latest = sorted[0];
      const status = pickAggregateStatus(sorted.map((r) => r.status));
      const lastContactAt = latest.last_message_at ?? latest.created_at;
      const budgetTotalCents = sorted.reduce(
        (acc, r) => acc + midBudget(r.budget_min_cents, r.budget_max_cents),
        0,
      );
      list.push({
        hostId,
        hostName: latest.host?.display_name?.trim() || "Host",
        hostAvatarUrl: latest.host?.avatar_url ?? null,
        inquiriesCount: sorted.length,
        status,
        latestInquiryId: latest.id,
        latestEventType: latest.event_type,
        latestEventDate: latest.event_date,
        lastContactAt,
        budgetTotalCents,
      });
    }
    list.sort(
      (a, b) =>
        new Date(b.lastContactAt).getTime() -
        new Date(a.lastContactAt).getTime(),
    );
    return list;
  }, [rows]);

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      // "Active" is a shortcut bucket — covers in-flight conversations
      // ('active' = replied/drafted) AND brand-new ones the vendor
      // hasn't touched yet. The chip count combines both, so the
      // filter has to as well or the row count won't match the chip.
      if (statusFilter === "active") {
        if (l.status !== "active" && l.status !== "new") return false;
      } else if (statusFilter !== "all" && l.status !== statusFilter) {
        return false;
      }
      if (q && !l.hostName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leads, query, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: leads.length, active: 0, won: 0, lost: 0, new: 0 };
    for (const l of leads) {
      if (l.status === "won") c.won++;
      else if (l.status === "active") c.active++;
      else if (l.status === "new") c.new++;
      else c.lost++;
    }
    return c;
  }, [leads]);

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main id="main-content" className="flex-1 min-w-0 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-editorial text-3xl">Leads</h1>
            <p className="text-sm text-muted-foreground">
              Every host who's reached out — past, present, and pipeline.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell variant="light" />
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-5">
          {/* Listing picker — mirrors the Calendar page. Every query
              below is scoped to whichever listing is selected here. */}
          <ListingPicker
            listings={listings}
            loading={listingsLoading}
            selectedId={selectedListingId}
            onSelect={(id) => {
              setSelectedListingId(id);
              setListingPickerOpen(false);
            }}
            open={listingPickerOpen}
            onOpenChange={setListingPickerOpen}
          />

          {/* Filter strip — segmented chip control on the left, search
              on the right. Keeps the controls inline so the table
              starts above the fold. */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="inline-flex items-center gap-1 rounded-full bg-secondary/40 p-1 self-start">
              <FilterChip
                label="All"
                count={counts.all}
                active={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              />
              <FilterChip
                label="Active"
                count={counts.active + counts.new}
                active={statusFilter === "active"}
                onClick={() => setStatusFilter("active")}
              />
              <FilterChip
                label="Won"
                count={counts.won}
                active={statusFilter === "won"}
                onClick={() => setStatusFilter("won")}
              />
              <FilterChip
                label="Lost"
                count={counts.lost}
                active={statusFilter === "lost"}
                onClick={() => setStatusFilter("lost")}
              />
            </div>
            <div className="relative md:w-72">
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search host…"
                aria-label="Search leads by host name"
                className="pl-9 rounded-full"
              />
            </div>
          </div>

          {/* Leads list */}
          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : filteredLeads.length === 0 ? (
            <EmptyState
              hasAnyLeads={leads.length > 0}
              statusFilter={statusFilter}
              query={query}
            />
          ) : (
            <ul className="space-y-2.5">
              {filteredLeads.map((lead) => (
                <li key={lead.hostId}>
                  <Link
                    to={`/vendor/inbox/${lead.latestInquiryId}`}
                    className="block rounded-2xl p-4 md:p-5 transition-colors hover:bg-secondary/40"
                    style={{
                      background: "rgba(255,253,250,0.7)",
                      border: "0.5px solid rgba(255,138,76,0.22)",
                    }}
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <Avatar
                        name={lead.hostName}
                        url={lead.hostAvatarUrl}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground truncate">
                            {lead.hostName}
                          </p>
                          <StatusBadge status={lead.status} />
                          {lead.inquiriesCount > 1 ? (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                              {lead.inquiriesCount} inquiries
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {lead.latestEventType ? (
                            <span className="capitalize">
                              {lead.latestEventType.replace(/_/g, " ")}
                            </span>
                          ) : null}
                          {lead.latestEventDate ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(
                                  lead.latestEventDate + "T00:00:00",
                                ).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                            </>
                          ) : null}
                          <span aria-hidden>·</span>
                          <span>{formatRelative(lead.lastContactAt)}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tnum">
                          {formatMoney(lead.budgetTotalCents)}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {lead.inquiriesCount > 1 ? "Total" : "Budget"}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-foreground/70 hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      <span
        className={`tnum text-[10px] rounded-full px-1.5 py-0.5 ${
          active
            ? "bg-background/20 text-background"
            : "bg-foreground/8 text-foreground/60"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: Lead["status"] }) {
  const style: Record<Lead["status"], { label: string; bg: string; fg: string }> = {
    won: { label: "Won", bg: "rgba(16,185,129,0.15)", fg: "#047857" },
    active: { label: "Active", bg: "rgba(255,138,76,0.18)", fg: "#c4541e" },
    new: { label: "New", bg: "rgba(59,130,246,0.15)", fg: "#1e40af" },
    lost: { label: "Lost", bg: "rgba(20,15,10,0.08)", fg: "#6b7280" },
  };
  const s = style[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="w-12 h-12 rounded-full object-cover shrink-0"
      />
    );
  }
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <span
      className="w-12 h-12 rounded-full inline-flex items-center justify-center font-semibold text-base shrink-0"
      style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
    >
      {initial}
    </span>
  );
}

function EmptyState({
  hasAnyLeads,
  statusFilter,
  query,
}: {
  hasAnyLeads: boolean;
  statusFilter: StatusFilter;
  query: string;
}) {
  if (hasAnyLeads && (statusFilter !== "all" || query)) {
    return (
      <div className="text-center py-16">
        <Filter className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          No leads match your filters.
        </p>
      </div>
    );
  }
  return (
    <div className="text-center py-16">
      <Inbox className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-base font-medium text-foreground">No leads yet</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        Hosts who inquire about your listing will show up here so you can see
        every conversation in one place.
      </p>
    </div>
  );
}
