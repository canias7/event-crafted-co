import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Counts = {
  pendingApplications: number;
  totalUsers: number;
  totalVendors: number;
  totalReviews: number;
};

export function DashboardPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [apps, users, vendors, reviews] = await Promise.all([
        supabase
          .from("vendor_profiles")
          .select("*", { count: "exact", head: true })
          .eq("application_status", "pending"),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("vendor_profiles").select("*", { count: "exact", head: true }),
        supabase.from("reviews").select("*", { count: "exact", head: true }),
      ]);
      if (!alive) return;
      const err = apps.error || users.error || vendors.error || reviews.error;
      if (err) setError(err.message);
      setCounts({
        pendingApplications: apps.count ?? 0,
        totalUsers: users.count ?? 0,
        totalVendors: vendors.count ?? 0,
        totalReviews: reviews.count ?? 0,
      });
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {error ? (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pending applications" value={counts?.pendingApplications} />
        <Stat label="Total users" value={counts?.totalUsers} />
        <Stat label="Vendor listings" value={counts?.totalVendors} />
        <Stat label="Reviews" value={counts?.totalReviews} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-2 font-mono text-3xl">{value ?? "—"}</p>
    </div>
  );
}
