import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarRange, Inbox, Star, TrendingUp, Zap } from "lucide-react";

// Performance overview for the vendor dashboard. Five coordinated
// charts arranged in a dense 2-up / 3-up grid so the page reads as a
// control panel instead of an empty corkboard:
//
//   Row 1 (3-up):
//     1. Inquiry funnel donut + booked-conversion pill in the corner
//     2. Profile-views 30-day area chart with the headline total
//     3. Conversion radial gauge — % of inquiries that converted to
//        bookings, framed as a target-style donut
//
//   Row 2 (2-up):
//     4. Inquiries by day-of-week — vertical bar chart so the vendor
//        can see when leads tend to land (helps with response SLAs)
//     5. Rating distribution — horizontal bars per star
//
// Pure presentational: parent owns the data fetch, this component
// just slices and visualises whatever it gets.

interface InquiryRow {
  status: string;
  created_at: string;
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

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

  // Day-of-week distribution: which weekday do inquiries tend to
  // land on? Useful for setting response-SLA expectations and
  // staffing decisions.
  const dowSeries = useMemo(() => {
    const buckets = DOW_LABELS.map((label) => ({ label, count: 0 }));
    for (const i of inquiries) {
      const d = new Date(i.created_at);
      const dow = d.getDay();
      if (dow >= 0 && dow < 7) buckets[dow].count += 1;
    }
    return buckets;
  }, [inquiries]);
  const peakDow = Math.max(0, ...dowSeries.map((d) => d.count));

  // Conversion gauge — same number that's pinned to the funnel
  // header, but visualised as a target-style radial so it reads as
  // "how close are you to ideal" instead of a plain percentage.
  const conversionData = [
    {
      name: "booked",
      value: conversionPct,
      fill: "hsl(150 40% 45%)",
    },
  ];

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 4,
    fontSize: 12,
  };

  return (
    <div className="space-y-3">
      {/* Row 1 — funnel, views, conversion gauge */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Inquiry funnel donut */}
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Inbox className="w-3.5 h-3.5" />
              <p className="font-label">Inquiry funnel</p>
            </div>
            {totalInquiries > 0 && (
              <p className="text-xs text-muted-foreground tnum">
                <span className="text-foreground font-medium">
                  {totalInquiries}
                </span>{" "}
                total
              </p>
            )}
          </div>
          {totalInquiries === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">
              No inquiries yet
            </p>
          ) : (
            <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
              <div className="relative h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={funnel}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {funnel.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Pie>
                    <RTooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="font-display text-base tnum leading-none">
                    {totalInquiries}
                  </p>
                </div>
              </div>
              <ul className="space-y-1">
                {funnel.map((d) => {
                  const pct = Math.round((d.value / totalInquiries) * 100);
                  return (
                    <li
                      key={d.key}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: d.color }}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="text-muted-foreground tnum">
                        {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* 30-day views trend */}
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5" />
              <p className="font-label">Views · 30d</p>
            </div>
            <p className="font-display text-base tnum">{totalViews}</p>
          </div>
          <div className="h-[120px] -mx-1">
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
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [
                    `${v} view${v === 1 ? "" : "s"}`,
                    "",
                  ]}
                  separator=""
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
            <span>{viewSeries[0]?.label}</span>
            <span>{viewSeries[viewSeries.length - 1]?.label}</span>
          </div>
        </div>

        {/* Conversion radial gauge */}
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Zap className="w-3.5 h-3.5" />
              <p className="font-label">Conversion</p>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Booked / total
            </p>
          </div>
          <div className="relative h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={conversionData}
                innerRadius="70%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis
                  type="number"
                  domain={[0, 100]}
                  angleAxisId={0}
                  tick={false}
                />
                <RadialBar
                  background={{ fill: "hsl(var(--secondary))" }}
                  dataKey="value"
                  cornerRadius={10}
                  isAnimationActive={false}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="font-display text-2xl tnum leading-none">
                {totalInquiries > 0 ? `${conversionPct}%` : "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                {bookedRow?.value ?? 0} booked
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2 — day-of-week + rating distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Day-of-week activity */}
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarRange className="w-3.5 h-3.5" />
              <p className="font-label">Inquiries by weekday</p>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              All time
            </p>
          </div>
          {totalInquiries === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">
              No inquiries yet
            </p>
          ) : (
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dowSeries}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  >
                    {dowSeries.map((d, idx) => (
                      <Cell
                        key={d.label}
                        fill={
                          d.count === peakDow && d.count > 0
                            ? "hsl(var(--accent))"
                            : `hsl(var(--accent) / ${
                                peakDow > 0 ? 0.25 + (d.count / peakDow) * 0.5 : 0.25
                              })`
                        }
                        opacity={
                          d.count === peakDow && d.count > 0
                            ? 1
                            : 0.45 + (idx % 2) * 0.05
                        }
                      />
                    ))}
                  </Bar>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis hide />
                  <RTooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "hsl(var(--secondary) / 0.4)" }}
                    formatter={(v: number) => [
                      `${v} inquir${v === 1 ? "y" : "ies"}`,
                      "",
                    ]}
                    separator=""
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Rating distribution */}
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Star className="w-3.5 h-3.5" />
              <p className="font-label">Reviews</p>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="font-display text-base tnum">
                {totalRatings > 0 ? avgRating.toFixed(1) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {totalRatings} review{totalRatings === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          {totalRatings === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">
              No reviews yet
            </p>
          ) : (
            <ul className="space-y-1.5">
              {ratingDist.map(({ stars, count }) => {
                const pct = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
                return (
                  <li key={stars} className="flex items-center gap-2 text-[11px]">
                    <span className="w-8 text-muted-foreground tnum inline-flex items-center gap-1">
                      {stars}
                      <Star className="w-2.5 h-2.5 fill-current" />
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-medium tnum w-6 text-right">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
