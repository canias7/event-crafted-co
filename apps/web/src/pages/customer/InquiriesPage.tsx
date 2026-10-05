import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { usePriceLabels } from "@/lib/priceLabels";
import { useCategoryNames } from "@/lib/categoryNames";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Inbox, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
// Lazy: heavy modal only loads when the host opens the inquiry form.
const InquiryFormModal = lazyWithReload(() =>
  import("@/components/inquiries/InquiryFormModal").then((m) => ({
    default: m.InquiryFormModal,
  })),
);
import { customerNavItems as navItems } from "@/data/navItems";
import { intlLocale } from "@/lib/intlLocale";

interface InquiryRow {
  id: string;
  event_type: string;
  event_date: string | null;
  guest_count: number | null;
  location: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  status: string;
  created_at: string;
  last_message_at: string;
  host_read_at: string | null;
  vendor: {
    business_name: string;
    category: string;
    logo_url: string | null;
  } | null;
}

const statusStyles: Record<string, string> = {
  new: "bg-accent/15 text-accent border-accent/30",
  replied: "bg-foreground text-background border-foreground",
  won: "bg-accent text-accent-foreground border-accent",
  lost: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

// Statuses the inbox labels (hostInquiries.json status.<status>);
// anything else shows the raw status.
const LABELLED_STATUSES = ["new", "replied", "won", "lost", "expired"];

function fmtMoney(c: number | null) {
  return c == null ? "—" : `$${(c / 100).toLocaleString(intlLocale())}`;
}

const AVATAR_COLORS = [
  "bg-violet-400",
  "bg-pink-400",
  "bg-zinc-800",
  "bg-zinc-800",
  "bg-emerald-400",
  "bg-blue-400",
  "bg-cyan-400",
  "bg-rose-400",
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const tr = (key: string, n?: number) =>
    i18n.t(`list.time.${key}`, { ns: "hostInquiries", n });
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return tr("now");
  if (m < 60) return tr("minutes", m);
  const h = Math.floor(m / 60);
  if (h < 24) return tr("hours", h);
  const d = Math.floor(h / 24);
  if (d === 1) return tr("yesterday");
  if (d < 7) return tr("days", d);
  return new Date(iso).toLocaleDateString(intlLocale(), {
    month: "short",
    day: "numeric",
  });
}

export default function InquiriesPage() {
  const { t } = useTranslation("hostInquiries");
  const priceLabels = usePriceLabels();
  const categoryNames = useCategoryNames();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<InquiryRow[]>([]);
  // Filter chip is mirrored to ?filter=<value> so it survives a
  // round-trip into an inquiry detail page and back. Default = "all".
  const [statusFilter, setStatusFilter] = useState(
    () => params.get("filter") ?? "all",
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(params.get("new") === "1");

  async function load() {
    if (!user) return;
    setLoading(true);
    // Cap at 100 so an active host doesn't download every historical
    // inquiry on each page load / realtime refetch. The list is sorted
    // newest-first so the cap drops oldest. If a host needs older
    // inquiries we can add "Load more" later.
    const { data, error } = await supabase
      .from("inquiries")
      .select(
        "id, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, status, created_at, last_message_at, host_read_at, vendor:vendor_profiles!inquiries_vendor_id_fkey(business_name, category, logo_url)",
      )
      .eq("host_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data as unknown as InquiryRow[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime: refetch when this host's inquiries change (e.g. status moves
  // from new → replied when the vendor responds). Uses the shared
  // user-scoped channel from RealtimeProvider.
  const realtimeConfig = useMemo(
    () =>
      user ? { table: "inquiries", filter: `host_id=eq.${user.id}` } : null,
    [user?.id],
  );
  useRealtime(realtimeConfig, () => load());

  // Strip ?new=1 once consumed so refreshes don't re-open the modal
  useEffect(() => {
    if (params.get("new")) {
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render every minute so relativeTime() decays — "3h" rolls over
  // to "4h" without requiring a manual refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Filter chips mirror mobile inbox (apps/host-mobile/app/(host)/inbox.tsx):
  //   All / Awaiting / Replied / Booked. No "Closed" — lost/expired
  //   inquiries are rare and hosts almost never filter for them.
  const filterOptions = [
    { value: "all", label: t("list.filters.all"), matches: () => true },
    {
      value: "awaiting",
      label: t("list.filters.awaiting"),
      matches: (s: string) => s === "new",
    },
    {
      value: "replied",
      label: t("list.filters.replied"),
      matches: (s: string) => s === "replied",
    },
    {
      value: "booked",
      label: t("list.filters.booked"),
      matches: (s: string) => s === "won",
    },
  ];

  const filteredRows = useMemo(() => {
    let out = rows;
    if (statusFilter !== "all") {
      out = out.filter((r) =>
        filterOptions.find((o) => o.value === statusFilter)?.matches(r.status),
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          r.vendor?.business_name?.toLowerCase().includes(q) ||
          r.vendor?.category?.toLowerCase().includes(q) ||
          r.event_type?.toLowerCase().includes(q) ||
          r.event_date?.toLowerCase().includes(q) ||
          r.location?.toLowerCase().includes(q),
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, statusFilter, search]);

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title={t("list.sidebarTitle")} backPath="/" />

      <main id="main-content" className="flex-1 min-w-0 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-5 md:px-8 py-5 sticky top-0 z-40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-editorial text-3xl">{t("list.title")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("list.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell variant="light" />
              <Button
                onClick={() => setModalOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("list.newInquiry")}
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          {/* Search box — vendor name, event, date, or location */}
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              className="pl-9 rounded-full bg-secondary/50 border-transparent focus-visible:ring-1"
            />
          </div>

          {/* Status filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
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
                  onClick={() => {
                    setStatusFilter(opt.value);
                    const next = new URLSearchParams(params);
                    if (opt.value === "all") next.delete("filter");
                    else next.set("filter", opt.value);
                    setParams(next, { replace: true });
                  }}
                  className={`rounded-full whitespace-nowrap h-9 text-xs ${
                    statusFilter === opt.value
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-secondary/60 text-muted-foreground hover:text-accent"
                  }`}
                >
                  {opt.label}
                  <span className="ml-2 tnum opacity-70">{count}</span>
                </Button>
              );
            })}
          </div>

          {/* List */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-20 px-6">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
                <h3 className="font-editorial text-2xl mb-2">
                  {rows.length === 0
                    ? t("list.empty.noneTitle")
                    : search
                      ? t("list.empty.noSearchTitle")
                      : t("list.empty.noFilterTitle")}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6 leading-relaxed">
                  {rows.length === 0
                    ? t("list.empty.noneBody")
                    : search
                      ? t("list.empty.noSearchBody")
                      : t("list.empty.noFilterBody")}
                </p>
                <div className="flex gap-2 justify-center">
                  {rows.length === 0 && (
                    <>
                      <Link to="/customer/explore">
                        <Button variant="outline" className="rounded-full">
                          {t("list.empty.browseVendors")}
                        </Button>
                      </Link>
                      <Button
                        onClick={() => setModalOpen(true)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t("list.newInquiry")}
                      </Button>
                    </>
                  )}
                  {rows.length > 0 && (
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setStatusFilter("all")}
                    >
                      {t("list.empty.clearFilter")}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredRows.map((r) => {
                  const vendorName = r.vendor?.business_name ?? t("vendorFallback");
                  const seed = r.vendor?.business_name ?? r.id;
                  const logoUrl = r.vendor?.logo_url ?? null;
                  // Unread when the latest activity is newer than the
                  // host's last visit. Mirrors the vendor inbox
                  // predicate so the dot behavior is consistent
                  // across roles.
                  const isUnread =
                    r.host_read_at == null ||
                    new Date(r.last_message_at).getTime() >
                      new Date(r.host_read_at).getTime();
                  return (
                    <Link
                      key={r.id}
                      to={`/customer/inquiries/${r.id}`}
                      className="p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 hover:bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt=""
                            aria-hidden
                            className="shrink-0 w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className={`shrink-0 w-12 h-12 rounded-full text-white flex items-center justify-center text-sm font-semibold ${avatarColor(seed)}`}
                          >
                            {initialsOf(vendorName)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                            {isUnread ? (
                              <span
                                aria-label={t("list.unread")}
                                className="shrink-0 w-2 h-2 rounded-full bg-gold"
                              />
                            ) : null}
                            <h3 className="font-display text-base truncate">
                              {vendorName}
                            </h3>
                            {r.vendor?.category && (
                              <span className="font-label text-muted-foreground">
                                {categoryNames.sub(r.vendor.category)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground capitalize">
                            {priceLabels.eventType(r.event_type)}
                            {r.event_date && (
                              <>
                                {" "}
                                · <span className="tnum">{r.event_date}</span>
                              </>
                            )}
                            {r.guest_count != null && (
                              <>
                                {" "}
                                · <span className="tnum">{r.guest_count}</span>{" "}
                                {t("list.guests", { count: r.guest_count })}
                              </>
                            )}
                            {r.location && <> · {r.location}</>}
                          </p>
                          {(r.budget_min_cents != null ||
                            r.budget_max_cents != null) && (
                            <p className="text-xs text-muted-foreground tnum mt-1">
                              {t("list.budget", {
                                min: fmtMoney(r.budget_min_cents),
                                max: fmtMoney(r.budget_max_cents),
                              })}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6 md:flex-shrink-0">
                        <Badge
                          variant="outline"
                          className={`${statusStyles[r.status] ?? ""} font-medium`}
                        >
                          {LABELLED_STATUSES.includes(r.status)
                            ? t(`status.${r.status}`)
                            : r.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground tnum hidden sm:block">
                          {relativeTime(r.last_message_at)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />

      {modalOpen && (
        <Suspense fallback={null}>
          <InquiryFormModal
            open={modalOpen}
            onOpenChange={(o) => {
              setModalOpen(o);
              if (!o) load();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
