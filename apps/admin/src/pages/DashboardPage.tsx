import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { describeVerdict, loadHomeTest, pct, verdict, type VariantStats } from "@/lib/homeTest";

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
      <HomeTestCard />
    </div>
  );
}

// Which homepage version is winning, at a glance; the full comparison is
// on the A/B testing page.
function HomeTestCard() {
  const [stats, setStats] = useState<VariantStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadHomeTest("all")
      .then((s) => alive && setStats(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const result = stats ? verdict(stats) : null;
  const words = result ? describeVerdict(result) : null;
  const leader = result && (result.status === "early" || result.status === "leading" || result.status === "winner") ? result.leader : null;

  return (
    <Link
      to="/homepage-test"
      className="mt-3 block rounded-lg border border-ink/10 bg-white p-4 transition-colors hover:border-ink/30"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-ink/50">Homepage A/B test</p>
        <span className="text-xs text-ink/50">See the comparison →</span>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-700">{error}</p>
      ) : words && stats ? (
        <>
          <p className="mt-2 font-semibold">{words.title}</p>
          <p className="mt-0.5 text-sm text-ink/70">{words.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {stats.map((s) => (
              <span
                key={s.variant}
                className={`rounded px-2 py-1 font-mono text-xs ${
                  leader === s.variant ? "bg-emerald-100 text-emerald-800" : "bg-ink/5 text-ink/70"
                }`}
              >
                {s.variant.toUpperCase()} · {s.visitors.toLocaleString()} visitors · {s.registrations.toLocaleString()}{" "}
                registered ({pct(s.registrations, s.visitors)})
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink/50">Loading…</p>
      )}
    </Link>
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
