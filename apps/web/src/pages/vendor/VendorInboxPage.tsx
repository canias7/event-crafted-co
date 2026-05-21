import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, Search, Sparkles } from "lucide-react";
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
  last_message_at: string;
  vendor_read_at: string | null;
  lead_score: "hot" | "warm" | "cold" | "unknown" | null;
  lead_score_reason: string | null;
  host: { display_name: string | null; avatar_url: string | null } | null;
}

// Map HILUX-classified temperatures to a pip color + label.
const LEAD_SCORE_STYLE: Record<
  "hot" | "warm" | "cold",
  { dot: string; text: string; label: string }
> = {
  hot: {
    dot: "bg-rose-500",
    text: "text-rose-700",
    label: "Hot",
  },
  warm: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    label: "Warm",
  },
  cold: {
    dot: "bg-sky-500",
    text: "text-sky-700",
    label: "Cold",
  },
};

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
  // HILUX master state lives on profiles (per-user, not per-listing
  // anymore). We fetch it once for the logged-in user; the sparkle
  // pip on every inbox row reflects that single value.
  const [hiluxEnabled, setHiluxEnabled] = useState(false);
  // Lead-temperature filter pills. "all" = no filter.
  const [leadFilter, setLeadFilter] = useState<"all" | "hot" | "warm" | "cold">(
    "all",
  );

  async function load(forVendorIds?: string[]) {
    const vids = forVendorIds ?? vendorIds;
    if (vids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    // Cap at 100 so a busy vendor with hundreds of historical
    // inquiries doesn't re-download all of them on each page load /
    // realtime refetch. Sorted newest-first so the cap drops oldest.
    // If a vendor needs older inquiries we can add "Load more" later.
    const { data } = await supabase
      .from("inquiries")
      .select(
        "id, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, status, created_at, last_message_at, vendor_read_at, host:profiles!inquiries_host_id_fkey(display_name, avatar_url)",
      )
      .in("vendor_id", vids)
      .order("last_message_at", { ascending: false })
      .limit(100);
    const baseRows = ((data as unknown as InquiryRow[]) ?? []);
    // Lead scores moved to a vendor-only inquiry_scores table so
    // hosts can't see how we classified them. Fetch separately and
    // merge in client-side. RLS gates to vendor team members only.
    const ids = baseRows.map((r) => r.id);
    let scored = baseRows;
    if (ids.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: scores } = await (supabase as any)
        .from("inquiry_scores")
        .select("inquiry_id, lead_score, lead_score_reason")
        .in("inquiry_id", ids);
      const byId = new Map<string, { lead_score: string | null; lead_score_reason: string | null }>();
      for (const s of (scores ?? []) as Array<{
        inquiry_id: string;
        lead_score: string | null;
        lead_score_reason: string | null;
      }>) {
        byId.set(s.inquiry_id, { lead_score: s.lead_score, lead_score_reason: s.lead_score_reason });
      }
      scored = baseRows.map((r) => ({
        ...r,
        lead_score: (byId.get(r.id)?.lead_score ?? null) as InquiryRow["lead_score"],
        lead_score_reason: byId.get(r.id)?.lead_score_reason ?? null,
      }));
    }
    setRows(scored);
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

  // Load the HILUX master flag from the owner profile once. The
  // sparkle pip on every row reflects this single boolean. RLS
  // restricts the read to the caller's own row.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("hilux_enabled")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setHiluxEnabled(
        ((data as { hilux_enabled?: boolean } | null)?.hilux_enabled) === true,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Re-render every minute so relativeTime() decays — "3h" rolls over
  // to "4h" without requiring a manual refresh. Bumping a no-op state
  // counter is enough; React re-runs the row map and the function
  // recomputes against Date.now().
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const leadCounts = useMemo(() => {
    const c = { hot: 0, warm: 0, cold: 0 };
    for (const r of rows) {
      if (r.lead_score === "hot") c.hot++;
      else if (r.lead_score === "warm") c.warm++;
      else if (r.lead_score === "cold") c.cold++;
    }
    return c;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (leadFilter !== "all" && r.lead_score !== leadFilter) return false;
      if (!q) return true;
      return (
        r.host?.display_name?.toLowerCase().includes(q) ||
        r.event_type?.toLowerCase().includes(q) ||
        r.event_date?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, leadFilter]);

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
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by host, event type, location, or date"
              className="pl-9 rounded-full bg-secondary/50 border-transparent focus-visible:ring-1"
            />
          </div>

          {/* Lead-temperature filter pills. Counts come from the
              unfiltered rows so the vendor can see at a glance how
              many hot leads they have without clicking through. */}
          <div className="mb-4 flex items-center gap-1.5 overflow-x-auto">
            {([
              { key: "all", label: "All", count: rows.length, dot: "" },
              { key: "hot", label: "Hot", count: leadCounts.hot, dot: "bg-rose-500" },
              { key: "warm", label: "Warm", count: leadCounts.warm, dot: "bg-amber-500" },
              { key: "cold", label: "Cold", count: leadCounts.cold, dot: "bg-sky-500" },
            ] as const).map((pill) => {
              const active = leadFilter === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setLeadFilter(pill.key)}
                  className={`shrink-0 inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "bg-secondary/50 text-foreground/75 border-transparent hover:bg-secondary"
                  }`}
                >
                  {pill.dot ? (
                    <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />
                  ) : null}
                  {pill.label}
                  <span className="tabular-nums opacity-70">{pill.count}</span>
                </button>
              );
            })}
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
                  hiluxEnabled={hiluxEnabled}
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
  hiluxEnabled,
}: {
  row: InquiryRow;
  isFirst: boolean;
  hiluxEnabled: boolean;
}) {
  const name = row.host?.display_name?.trim() || "Host";
  const initial = name.charAt(0).toUpperCase();
  const eventLabel = row.event_type.replace(/_/g, " ");
  // iMessage convention: blue dot whenever there's activity newer than
  // the last time the vendor opened this thread. Plain
  // "vendor_read_at == null" used to flip permanently off on first
  // open, hiding subsequent new messages from the inbox indicator.
  const isUnread =
    row.vendor_read_at == null ||
    new Date(row.last_message_at).getTime() >
      new Date(row.vendor_read_at).getTime();
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

        {/* Avatar — host's profile photo if uploaded, else colored initial */}
        {row.host?.avatar_url ? (
          <img
            src={row.host.avatar_url}
            alt=""
            className="shrink-0 w-11 h-11 rounded-full object-cover"
            aria-hidden
          />
        ) : (
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
        )}

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
            {hiluxEnabled ? (
              <span
                className="shrink-0 inline-flex items-center"
                title="HILUX is answering for you"
                aria-label="HILUX is answering for you"
              >
                <Sparkles className="w-3 h-3 text-accent" />
              </span>
            ) : null}
            {row.lead_score && row.lead_score !== "unknown" ? (
              (() => {
                const style = LEAD_SCORE_STYLE[row.lead_score];
                return (
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider ${style.text}`}
                    title={row.lead_score_reason ?? undefined}
                    aria-label={`Lead temperature: ${style.label}${
                      row.lead_score_reason ? `. ${row.lead_score_reason}` : ""
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {style.label}
                  </span>
                );
              })()
            ) : null}
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
          {relativeTime(row.last_message_at)}
        </span>
      </Link>
    </li>
  );
}

