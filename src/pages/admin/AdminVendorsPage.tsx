import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck, Loader2, ExternalLink, MapPin, Upload } from "lucide-react";
// Lazy: only loads when the admin clicks "Bulk import."
const BulkVendorImportDialog = lazy(() =>
  import("@/components/admin/BulkVendorImportDialog").then((m) => ({
    default: m.BulkVendorImportDialog,
  })),
);
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminNavItems as navItems } from "@/data/navItems";

interface VendorRow {
  id: string;
  business_name: string;
  category: string;
  location: string | null;
  verified_at: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  application_status: "pending" | "approved" | "rejected";
}

export default function AdminVendorsPage() {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_profiles")
      .select(
        "id, business_name, category, location, verified_at, created_at, latitude, longitude, application_status",
      )
      // Pending applications first so admin sees them at the top.
      .order("application_status", { ascending: true })
      .order("created_at", { ascending: false });
    setRows((data as VendorRow[]) ?? []);
    setLoading(false);
  }

  async function setApplicationStatus(
    v: VendorRow,
    next: "approved" | "rejected",
  ) {
    setPendingId(v.id);
    let notes: string | null = null;
    if (next === "rejected") {
      // Quick prompt for a note. Optional.
      notes = window.prompt(
        "Reason for rejection (shown to vendor on their dashboard, optional):",
        "",
      );
      if (notes === null) {
        // User cancelled the prompt.
        setPendingId(null);
        return;
      }
      notes = notes.trim() || null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        application_status: next,
        application_reviewed_at: new Date().toISOString(),
        application_review_notes: notes,
      })
      .eq("id", v.id);
    setPendingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === v.id ? { ...r, application_status: next } : r,
      ),
    );
    toast.success(next === "approved" ? "Application approved — vendor is live" : "Application rejected");
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleVerified(v: VendorRow) {
    setPendingId(v.id);
    const next = v.verified_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from("vendor_profiles")
      .update({ verified_at: next })
      .eq("id", v.id);
    setPendingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === v.id ? { ...r, verified_at: next } : r)),
    );
    toast.success(next ? "Vendor verified" : "Verification removed");
  }

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState<{
    done: number;
    total: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const ungeocodedCount = rows.filter(
    (r) => r.location && (r.latitude == null || r.longitude == null),
  ).length;

  async function backfillGeocode() {
    const targets = rows.filter(
      (r) => r.location && (r.latitude == null || r.longitude == null),
    );
    if (targets.length === 0) {
      toast.success("Every vendor with a location is already on the map");
      return;
    }
    setGeocoding(true);
    setGeocodeProgress({ done: 0, total: targets.length, skipped: 0, failed: 0 });
    let failed = 0;
    let skipped = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const result = await supabase.functions.invoke("geocode-vendor", {
        body: { vendorId: t.id },
      });
      const err = result.error;
      const data = result.data as { ok?: boolean; cached?: boolean } | null;
      if (err || !data?.ok) {
        failed++;
      } else if (data.cached) {
        skipped++;
      }
      setGeocodeProgress({
        done: i + 1,
        total: targets.length,
        skipped,
        failed,
      });
      // Nominatim asks for ~1 req/sec — pace the loop.
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    }
    setGeocoding(false);
    toast.success(
      `Backfill done · ${targets.length - failed}/${targets.length} pinned${failed ? ` · ${failed} failed` : ""}`,
    );
    load();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.business_name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.location ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Verify, unverify, or preview vendor profiles
          </p>
        </div>

        <div className="p-4 md:p-8 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, category, or location"
                className="h-11 pl-10 rounded-full bg-secondary/80 border-none"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="rounded-full"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Bulk import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={backfillGeocode}
              disabled={geocoding || ungeocodedCount === 0}
              className="rounded-full"
              title="Calls geocode-vendor for every vendor with a location text but no lat/lng"
            >
              {geocoding ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Geocoding {geocodeProgress?.done}/{geocodeProgress?.total}…
                </>
              ) : (
                <>
                  <MapPin className="w-3.5 h-3.5 mr-1.5" />
                  Backfill {ungeocodedCount > 0 ? `(${ungeocodedCount})` : ""}
                </>
              )}
            </Button>
          </div>

          <div className="bg-card border border-border rounded-sm overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 px-6">
                <p className="font-display text-xl mb-2">
                  {rows.length === 0
                    ? "No vendors yet"
                    : "No match for that search"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Business
                      </th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Category
                      </th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Location
                      </th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Joined
                      </th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Status
                      </th>
                      <th className="text-right py-3 px-5 font-label text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v) => (
                      <tr
                        key={v.id}
                        className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="py-3 px-5 font-medium">
                          {v.business_name}
                        </td>
                        <td className="py-3 px-5 text-muted-foreground">
                          {v.category}
                        </td>
                        <td className="py-3 px-5 text-muted-foreground">
                          {v.location ?? "—"}
                        </td>
                        <td className="py-3 px-5 tnum text-muted-foreground">
                          {new Date(v.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-5">
                          <div className="flex flex-col gap-1">
                            {v.application_status === "approved" ? (
                              <Badge className="bg-accent/15 text-accent border border-accent/30">
                                Approved
                              </Badge>
                            ) : v.application_status === "rejected" ? (
                              <Badge variant="outline" className="text-destructive border-destructive/40">
                                Rejected
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                Pending review
                              </Badge>
                            )}
                            {v.verified_at && (
                              <Badge className="bg-accent/15 text-accent border border-accent/30 w-fit">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                Verified
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-5 text-right whitespace-nowrap">
                          <Link
                            to={`/vendors/${v.id}`}
                            target="_blank"
                            className="inline-flex items-center mr-2"
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              View
                            </Button>
                          </Link>
                          {v.application_status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs rounded-full bg-foreground text-background hover:bg-foreground/90 mr-2"
                                disabled={pendingId === v.id}
                                onClick={() => setApplicationStatus(v, "approved")}
                              >
                                {pendingId === v.id ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : null}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs rounded-full mr-2"
                                disabled={pendingId === v.id}
                                onClick={() => setApplicationStatus(v, "rejected")}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {v.application_status === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs rounded-full"
                              disabled={pendingId === v.id}
                              onClick={() => toggleVerified(v)}
                            >
                              {pendingId === v.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : null}
                              {v.verified_at ? "Unverify" : "Verify"}
                            </Button>
                          )}
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

      {importOpen && (
        <Suspense fallback={null}>
          <BulkVendorImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={() => {
              setImportOpen(false);
              load();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
