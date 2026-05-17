import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, Search } from "lucide-react";
import { useRealtime } from "@/lib/realtime";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { vendorNavItems as navItems } from "@/data/navItems";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { VENDOR_INBOX_HUB_TABS } from "@/data/hubTabs";

// iMessage-style conversation list. Each row is one inquiry from a
// host. Status is a single colored dot at the left edge (new = amber,
// replied = blue, won = green, lost/expired = muted grey). Click a
// row to open the thread at /vendor/inbox/:id. Filter pills,
// per-column table, and label-chip strip from the old design are
// retired — the row is the unit, not a tabular crm.

interface InquiryRow {
  id: string;
  event_type: string;
  event_date: string | null;
  guest_count: number | null;
  location: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  special_requests: string | null;
  status: string;
  created_at: string;
  vendor_read_at: string | null;
  host: { display_name: string | null } | null;
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


function previewFor(r: InquiryRow): string {
  if (r.special_requests && r.special_requests.trim().length > 0) {
    return r.special_requests.trim();
  }
  const type = r.event_type.replace(/_/g, " ");
  return `Inquiry about your ${type}`;
}

export default function VendorInboxPage() {
  const { user, vendorMemberships } = useAuth();
  // Cover EVERY listing the vendor owns, not just the first one. A
  // vendor with multiple listings should see inquiries for all of them
  // in the same inbox. vendorMemberships is hydrated by useAuth from
  // vendor_team_members.
  const vendorIds = useMemo(
    () => vendorMemberships.map((m) => m.vendor_id),
    [vendorMemberships],
  );
  const vendorIdsKey = vendorIds.join(",");
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load(forVendorIds?: string[]) {
    const vids = forVendorIds ?? vendorIds;
    if (vids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("inquiries")
      .select(
        "id, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, status, created_at, vendor_read_at, host:profiles!inquiries_host_id_fkey(display_name)",
      )
      .in("vendor_id", vids)
      .order("created_at", { ascending: false });
    setRows((data as unknown as InquiryRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    if (vendorIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    load(vendorIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorIdsKey]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.host?.display_name?.toLowerCase().includes(q) ||
        r.event_type?.toLowerCase().includes(q) ||
        r.event_date?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // Realtime: subscribe to the user-scoped channel and refetch when
  // ANY inquiry changes. The shared user channel only delivers events
  // the caller is allowed to see (RLS-filtered), so this catches
  // inquiries across every listing without needing a per-listing
  // subscription.
  const realtimeConfig = useMemo(
    () => (vendorIds.length > 0 ? { table: "inquiries" } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendorIdsKey],
  );
  useRealtime(realtimeConfig, () => {
    if (vendorIds.length > 0) load(vendorIds);
  });

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-editorial text-3xl">Inbox</h1>
              <p className="text-sm text-muted-foreground">
                Conversations with hosts — every message in one place
              </p>
            </div>
            <NotificationBell variant="light" />
          </div>
          <SubNavTabs tabs={VENDOR_INBOX_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by host, event type, location, or date"
              className="pl-9 rounded-full bg-secondary/50 border-transparent focus-visible:ring-1"
            />
          </div>

          {loading ? (
            <div className="bg-card rounded-2xl card-shadow p-12 text-center text-muted-foreground">
              Loading conversations…
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="bg-card rounded-2xl card-shadow py-20 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
                <Inbox className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-display text-xl">
                {rows.length === 0
                  ? "No inquiries yet"
                  : "Nothing matches that search"}
              </p>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                  When a host sends you an inquiry, the conversation will land
                  here.
                </p>
              ) : null}
            </div>
          ) : (
            <ul
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgba(255,253,250,0.6)",
                border: "0.5px solid rgba(255,138,76,0.18)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              {filteredRows.map((r, i) => (
                <ConversationRow
                  key={r.id}
                  row={r}
                  isFirst={i === 0}
                />
              ))}
            </ul>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function ConversationRow({
  row,
  isFirst,
}: {
  row: InquiryRow;
  isFirst: boolean;
}) {
  const name = row.host?.display_name?.trim() || "Host";
  const initial = name.charAt(0).toUpperCase();
  const eventLabel = row.event_type.replace(/_/g, " ");
  // iMessage convention: a single blue dot only when the vendor
  // hasn't opened this thread yet. Once they tap in (which writes
  // vendor_read_at server-side), the dot goes away.
  const isUnread = row.vendor_read_at == null;
  return (
    <li>
      <Link
        to={`/vendor/inbox/${row.id}`}
        className={`flex items-stretch gap-3 px-4 py-3 transition-colors hover:bg-white/40 ${
          isFirst ? "" : "border-t border-foreground/[0.06]"
        }`}
      >
        {/* Unread indicator — blue dot only when unread, otherwise a
            transparent spacer so rows stay aligned. */}
        <span
          className="self-center shrink-0 w-2 h-2 rounded-full"
          aria-label={isUnread ? "Unread" : undefined}
          title={isUnread ? "Unread" : undefined}
        >
          {isUnread ? (
            <span className="block w-2 h-2 rounded-full bg-blue-500" />
          ) : null}
        </span>

        {/* Avatar */}
        <span
          className="shrink-0 w-11 h-11 rounded-full inline-flex items-center justify-center font-semibold"
          style={{
            background: "rgba(255,138,76,0.18)",
            color: "#c4541e",
          }}
          aria-hidden
        >
          {initial}
        </span>

        {/* Name + preview */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`truncate text-[15px] ${
                isUnread ? "font-semibold text-foreground" : "font-medium text-foreground"
              }`}
            >
              {name}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground capitalize truncate">
              · {eventLabel}
            </span>
          </div>

          {/* Last message / inquiry preview */}
          <p className="mt-0.5 text-[13px] text-muted-foreground leading-snug truncate">
            {previewFor(row)}
          </p>
        </div>

        {/* Timestamp */}
        <span className="shrink-0 text-[11px] text-muted-foreground self-start tnum">
          {relativeTime(row.created_at)}
        </span>
      </Link>
    </li>
  );
}

