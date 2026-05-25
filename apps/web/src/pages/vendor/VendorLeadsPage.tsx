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
import { Filter, ImagePlus, Inbox, Plus, Search } from "lucide-react";
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
  hostEmail: string | null;
  // Synthetic "LD-XXXXXX" id derived from host_id so vendors have a
  // stable, scannable reference per lead (matches CRM convention).
  leadId: string;
  inquiriesCount: number;
  status: "won" | "active" | "new" | "lost";
  // The latest inquiry's id — used as the click-through target.
  latestInquiryId: string;
  latestEventType: string | null;
  latestEventDate: string | null;
  lastContactAt: string; // ISO
  // First-contact date — earliest inquiry created_at across all of
  // this host's inquiries with this listing. "Created" in CRM language.
  createdAt: string; // ISO
  budgetTotalCents: number;
}

function leadIdFromHostId(hostId: string): string {
  // First 6 hex chars of the host's UUID, uppercased. Stable across
  // sessions, looks like LD-A3F2C9.
  const hex = hostId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `LD-${hex}`;
}

function formatCreated(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
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
  // Map of host_id → email. Filled from get_vendor_lead_emails RPC
  // alongside the inquiry fetch. Email lives on auth.users which
  // isn't RLS-readable, so the RPC is the only client-side path.
  const [emails, setEmails] = useState<Record<string, string>>({});
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
      setEmails({});
      setLoading(false);
      return;
    }
    setLoading(true);
    // Cap at 200 to match VendorInboxPage's "don't pull every historical
    // inquiry on each load" guard, but a little higher because Leads
    // aggregates by host — a vendor with many repeat customers gains
    // more by seeing more inquiries per page load than the inbox does.
    // Inquiries + emails fetched in parallel — emails come from a
    // gated SECURITY DEFINER RPC since auth.users isn't RLS-readable.
    const [inqRes, emailRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("inquiries")
        .select(
          "id, host_id, event_type, event_date, budget_min_cents, budget_max_cents, status, created_at, last_message_at, host:profiles!inquiries_host_id_fkey(display_name, avatar_url)",
        )
        .eq("vendor_id", selectedListingId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("get_vendor_lead_emails", {
        p_vendor_id: selectedListingId,
      }),
    ]);
    setRows((inqRes.data as unknown as InquiryRow[]) ?? []);
    const emailRows = (emailRes.data as
      | Array<{ host_id: string; email: string }>
      | null) ?? [];
    const emailMap: Record<string, string> = {};
    for (const r of emailRows) {
      if (r.host_id && r.email) emailMap[r.host_id] = r.email;
    }
    setEmails(emailMap);
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
      // First-contact = earliest created_at across this host's inquiries.
      const createdAt = sorted.reduce(
        (min, r) => (r.created_at < min ? r.created_at : min),
        latest.created_at,
      );
      const budgetTotalCents = sorted.reduce(
        (acc, r) => acc + midBudget(r.budget_min_cents, r.budget_max_cents),
        0,
      );
      list.push({
        hostId,
        hostName: latest.host?.display_name?.trim() || "Host",
        hostAvatarUrl: latest.host?.avatar_url ?? null,
        hostEmail: emails[hostId] ?? null,
        leadId: leadIdFromHostId(hostId),
        inquiriesCount: sorted.length,
        status,
        latestInquiryId: latest.id,
        latestEventType: latest.event_type,
        latestEventDate: latest.event_date,
        lastContactAt,
        createdAt,
        budgetTotalCents,
      });
    }
    list.sort(
      (a, b) =>
        new Date(b.lastContactAt).getTime() -
        new Date(a.lastContactAt).getTime(),
    );
    return list;
  }, [rows, emails]);

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
      if (q) {
        const hay = [
          l.hostName,
          l.hostEmail ?? "",
          l.leadId,
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
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
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-editorial text-3xl">My Vendora</h1>
              <p className="text-sm text-muted-foreground">
                Every host who's reached out — past, present, and pipeline.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell variant="light" />
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-5">
          {/* Listing picker — mirrors the Calendar page. Every query
              below is scoped to whichever listing is selected here.
              Two empty states handle the cases where the picker would
              be useless: no listings at all (brand-new vendor) and
              listings-but-none-approved (waiting on review). */}
          {!listingsLoading && listings.length === 0 ? (
            <NoListingsEmptyState />
          ) : !listingsLoading &&
            !listings.some((l) => l.application_status === "approved") ? (
            <PendingApprovalEmptyState />
          ) : (
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
          )}

          {selectedListingId && (
            <>
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
                placeholder="Search name, email, or LD-…"
                aria-label="Search leads by name, email, or Lead ID"
                className="pl-9 rounded-full"
              />
            </div>
          </div>

          {/* CRM-style table: Lead ID · Name · Email · Status · Created.
              Row click → opens the latest inquiry chat. */}
          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgba(255,253,250,0.7)",
                border: "0.5px solid rgba(255,138,76,0.22)",
              }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                      <th className="px-4 md:px-5 py-3 font-semibold">Lead</th>
                      <th className="px-4 md:px-5 py-3 font-semibold">Name</th>
                      <th className="px-4 md:px-5 py-3 font-semibold">Email</th>
                      <th className="px-4 md:px-5 py-3 font-semibold">Status</th>
                      <th className="px-4 md:px-5 py-3 font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr
                        className="border-t"
                        style={{ borderColor: "rgba(255,138,76,0.12)" }}
                      >
                        <td
                          colSpan={5}
                          className="px-4 md:px-5 py-16 text-center"
                        >
                          <EmptyState
                            hasAnyLeads={leads.length > 0}
                            statusFilter={statusFilter}
                            query={query}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {filteredLeads.map((lead) => (
                      <tr
                        key={lead.hostId}
                        className="border-t cursor-pointer transition-colors hover:bg-secondary/40"
                        style={{ borderColor: "rgba(255,138,76,0.12)" }}
                        onClick={() =>
                          window.location.assign(
                            `/vendor/inbox/${lead.latestInquiryId}`,
                          )
                        }
                      >
                        <td className="px-4 md:px-5 py-3 font-mono text-xs text-[#c4541e]">
                          {lead.leadId}
                        </td>
                        <td className="px-4 md:px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              name={lead.hostName}
                              url={lead.hostAvatarUrl}
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">
                                {lead.hostName}
                              </p>
                              {lead.inquiriesCount > 1 ? (
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  {lead.inquiriesCount} inquiries
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 md:px-5 py-3 text-foreground/80">
                          {lead.hostEmail ? (
                            <a
                              href={`mailto:${lead.hostEmail}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-foreground hover:underline"
                            >
                              {lead.hostEmail}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 md:px-5 py-3">
                          <StatusBadge status={lead.status} />
                        </td>
                        <td className="px-4 md:px-5 py-3 text-foreground/80 tnum whitespace-nowrap">
                          {formatCreated(lead.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function NoListingsEmptyState() {
  return (
    <div
      className="rounded-2xl p-10 md:p-14 text-center"
      style={{
        background: "rgba(255,253,250,0.6)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        className="w-14 h-14 mx-auto rounded-full inline-flex items-center justify-center mb-5"
        style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
      >
        <ImagePlus className="w-6 h-6" />
      </div>
      <h2 className="font-editorial italic text-3xl mb-2">
        Upload your first listing
      </h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
        Leads live per listing. Once you publish your first listing,
        hosts who inquire will start showing up here so you can track
        every conversation in one place.
      </p>
      <Link
        to="/vendor/me"
        className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        <Plus className="w-4 h-4" />
        Create a listing
      </Link>
    </div>
  );
}

function PendingApprovalEmptyState() {
  return (
    <div
      className="rounded-2xl p-10 md:p-14 text-center"
      style={{
        background: "rgba(255,253,250,0.6)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        className="w-14 h-14 mx-auto rounded-full inline-flex items-center justify-center mb-5"
        style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
      >
        <ImagePlus className="w-6 h-6" />
      </div>
      <h2 className="font-editorial italic text-3xl mb-2">
        Your listings are under review
      </h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
        Leads live per listing. Once one of your listings is approved
        hosts will be able to inquire and they'll start showing up here.
      </p>
      <Link
        to="/vendor/me"
        className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Review my listings
      </Link>
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
