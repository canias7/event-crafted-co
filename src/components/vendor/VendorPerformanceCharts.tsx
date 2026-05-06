import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Inbox, Star, TrendingUp } from "lucide-react";

// Single performance panel for the vendor dashboard. Replaces the
// flat 4-up "Insights" tile grid with three coordinated charts:
//
//   1. Inquiry funnel — donut keyed by status, total in the middle,
//      legend on the side with per-status counts and percent.
//   2. Profile views (30d) — area sparkline keyed by day so vendors
//      can see week-over-week traction at a glance.
//   3. Rating distribution — horizontal bars per star with the
//      headline avg + total review count up top.
//
// Pure presentational: parent owns the data fetch, this component
// just slices and visualises whatever it gets.

interface InquiryRow {
  status: string;
}
interface RatingRow {
  rating: number;
}
interface ViewRow {
  viewed_at: string;
}

const FUNNEL_GROUPS: Array<{
  key: "new" | "drafted" | "replied" | "won" | "lost";
  label: string;
  color: string;
  match: (status: string) => boolean;
}> = [
  {
    key: "new",
    label: "New",
    color: "hsl(40 85% 55%)",
    match: (s) => s === "new",
  },
  {
    key: "drafted",
    label: "AI drafting",
    color: "hsl(280 35% 65%)",
    match: (s) => s === "drafted",
  },
  {
    key: "replied",
    label: "Replied",
    color: "hsl(215 50% 60%)",
    match: (s) => s === "replied",
  },
  {
    key: "won",
    label: "Booked",
    color: "hsl(150 40% 45%)",
    match: (s) => s === "won",
  },
  {
    key: "lost",
    label: "Closed",
    color: "hsl(220 8% 55%)",
    match: (s) => s === "lost" || s === "expired",
  },
];

export function VendorPerformanceCharts({
  inquiries,
  ratings,
  views,
}: {
  inquiries: InquiryRow[];
  ratings: RatingRow[];
  views: ViewRow[];
}) {
  const funnel = useMemo(() => {
    return FUNNEL_GROUPS.map((g) => ({
      key: g.key,
      name: g.label,
      color: g.color,
      value: inquiries.filter((i) => g.match(i.status)).length,
    })).filter((d) => d.value > 0);
  }, [inquiries]);

  const totalInquiries = funnel.reduce((s, d) => s + d.value, 0);
  const bookedRow = funnel.find((d) => d.key === "won");
  const conversionPct =
    totalInquiries > 0 && bookedRow
      ? Math.round((bookedRow.value / totalInquiries) * 100)
      : 0;

  const viewSeries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: Array<{ date: string; label: string; views: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        date: iso,
        label: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        views: 0,
      });
    }
    const byDate = new Map(days.map((d, idx) => [d.date, idx]));
    for (const v of views) {
      const iso = v.viewed_at.slice(0, 10);
      const idx = byDate.get(iso);
      if (idx != null) days[idx].views += 1;
    }
    return days;
  }, [views]);

  const totalViews = viewSeries.reduce((s, d) => s + d.views, 0);
  const peakViews = Math.max(1, ...viewSeries.map((d) => d.views));

  const ratingDist = useMemo(() => {
    return [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: ratings.filter((r) => Math.round(r.rating) === stars).length,
    }));
  }, [ratings]);

  const totalRatings = ratings.length;
  const avgRating =
    totalRatings > 0
      ? ratings.reduce((s, r) => s + r.rating, 0) / totalRatings
      : 0;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Inquiry funnel donut */}
      <div className="rounded-sm border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Inbox className="w-3.5 h-3.5" />
            <p className="font-label">Inquiry funnel</p>
          </div>
          {totalInquiries > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-display text-base text-foreground tnum mr-1">
                {conversionPct}%
              </span>
              booked
            </p>
          )}
        </div>
        {totalInquiries === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            No inquiries yet — the funnel populates as hosts reach out.
          </p>
        ) : (
          <div className="grid sm:grid-cols-[180px_1fr] gap-5 items-center">
            <div className="relative h-[170px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={funnel}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={78}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {funnel.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Total
                </p>
                <p className="font-display text-xl tnum">{totalInquiries}</p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {funnel.map((d) => {
                const pct = Math.round((d.value / totalInquiries) * 100);
                return (
                  <li
                    key={d.key}
                    className="flex items-center gap-3 text-xs"
                  >
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ background: d.color }}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="text-muted-foreground tnum">{pct}%</span>
                    <span className="font-medium tnum w-8 text-right">
                      {d.value}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* 30-day views trend */}
      <div className="rounded-sm border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5" />
            <p className="font-label">Profile views · 30d</p>
          </div>
          <p className="font-display text-xl tnum">{totalViews}</p>
        </div>
        <div className="h-[170px] -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={viewSeries}
              margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="hsl(var(--accent))"
                    stopOpacity={0.45}
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(var(--accent))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="views"
                stroke="hsl(var(--accent))"
                strokeWidth={1.75}
                fill="url(#viewsFill)"
                isAnimationActive={false}
              />
              <XAxis dataKey="label" hide />
              <YAxis hide domain={[0, peakViews + 1]} />
              <RTooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 4,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v} view${v === 1 ? "" : "s"}`, ""]}
                separator=""
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground -mb-1">
          <span>{viewSeries[0]?.label}</span>
          <span>{viewSeries[viewSeries.length - 1]?.label}</span>
        </div>
      </div>

      {/* Rating distribution */}
      <div className="rounded-sm border border-border bg-card p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Star className="w-3.5 h-3.5" />
            <p className="font-label">Reviews</p>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="font-display text-xl tnum">
              {totalRatings > 0 ? avgRating.toFixed(1) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalRatings} review{totalRatings === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {totalRatings === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No reviews yet — they'll appear here once hosts post them.
          </p>
        ) : (
          <ul className="space-y-2">
            {ratingDist.map(({ stars, count }) => {
              const pct = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
              return (
                <li key={stars} className="flex items-center gap-3 text-xs">
                  <span className="w-10 text-muted-foreground tnum inline-flex items-center gap-1">
                    {stars}
                    <Star className="w-3 h-3 fill-current" />
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-medium tnum w-8 text-right">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
