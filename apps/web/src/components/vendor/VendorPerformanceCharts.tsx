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
import {
  CalendarRange,
  DollarSign,
  Inbox,
  PartyPopper,
  Star,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";

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
  event_type?: string | null;
  event_date?: string | null;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
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

  // Event-type mix — top 5 inquiry event types, bucket the long tail
  // into "Other". Surfaces what kind of work the vendor is actually
  // attracting (mostly weddings? corporate? milestone birthdays?).
  const eventTypeSeries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of inquiries) {
      const key = (i.event_type ?? "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .map(([name, value]) => ({
        name: name.replace(/_/g, " "),
        value,
      }))
      .sort((a, b) => b.value - a.value);
    if (sorted.length <= 5) return sorted;
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    return [
      ...top,
      {
        name: "Other",
        value: rest.reduce((s, d) => s + d.value, 0),
      },
    ];
  }, [inquiries]);
  const eventTypeMax = Math.max(1, ...eventTypeSeries.map((d) => d.value));

  // Booking lead time — how far in advance hosts typically inquire.
  // Useful for staffing + understanding whether the marketing push
  // should target same-week panic bookings or 6+ months out planners.
  const leadTimeSeries = useMemo(() => {
    const buckets = [
      { label: "<2 wk", min: 0, max: 14, count: 0 },
      { label: "2–4 wk", min: 14, max: 30, count: 0 },
      { label: "1–3 mo", min: 30, max: 90, count: 0 },
      { label: "3–6 mo", min: 90, max: 180, count: 0 },
      { label: "6+ mo", min: 180, max: Infinity, count: 0 },
    ];
    for (const i of inquiries) {
      if (!i.event_date) continue;
      const inquired = new Date(i.created_at).getTime();
      const event = new Date(i.event_date).getTime();
      if (!Number.isFinite(event) || !Number.isFinite(inquired)) continue;
      const days = Math.max(0, Math.round((event - inquired) / 86_400_000));
      const b = buckets.find((bk) => days >= bk.min && days < bk.max);
      if (b) b.count += 1;
    }
    return buckets;
  }, [inquiries]);
  const leadTimePeak = Math.max(1, ...leadTimeSeries.map((d) => d.count));
  const leadTimeTotal = leadTimeSeries.reduce((s, d) => s + d.count, 0);

  // Inquiry-budget headline — average of (min+max)/2 across rows that
  // expose a budget. Single big number tile so vendors can sense
  // whether they're getting the calibre of inquiry they want.
  const budgetSeries = useMemo(() => {
    const values: number[] = [];
    for (const i of inquiries) {
      const min = i.budget_min_cents ?? null;
      const max = i.budget_max_cents ?? null;
      if (min == null && max == null) continue;
      const mid =
        min != null && max != null
          ? (min + max) / 2
          : (min ?? max) ?? 0;
      if (mid > 0) values.push(mid);
    }
    if (values.length === 0) {
      return { avg: 0, median: 0, count: 0 };
    }
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    return { avg, median, count: values.length };
  }, [inquiries]);
  const fmtBudget = (cents: number) => {
    if (cents <= 0) return "—";
    return cents >= 100_000_00
      ? `$${Math.round(cents / 100_000_00) / 10}M`
      : cents >= 1_000_00
        ? `$${(cents / 100_000).toFixed(1)}k`
        : `$${Math.round(cents / 100).toLocaleString()}`;
  };

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 4,
    fontSize: 12,
  };

  return (
    <div className="space-y-2 md:space-y-3">
      {/* Row 1 — funnel, views, conversion gauge */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Inquiry funnel donut */}
        <div className="card-soft p-3 md:p-4">
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
              <div className="relative h-[90px] md:h-[120px]">
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
        <div className="card-soft p-3 md:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5" />
              <p className="font-label">Views · 30d</p>
            </div>
            <p className="font-display text-base tnum">{totalViews}</p>
          </div>
          <div className="h-[90px] md:h-[120px] -mx-1">
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
        <div className="card-soft p-3 md:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Zap className="w-3.5 h-3.5" />
              <p className="font-label">Conversion</p>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Booked / total
            </p>
          </div>
          <div className="relative h-[90px] md:h-[120px]">
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
        <div className="card-soft p-3 md:p-4">
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
            <div className="h-[90px] md:h-[120px]">
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
        <div className="card-soft p-3 md:p-4">
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

      {/* Row 3 — event-type mix, lead time histogram, inquiry budget */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Event type mix — horizontal bars so the labels stay
            readable even when sub-types get long. */}
        <div className="card-soft p-3 md:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <PartyPopper className="w-3.5 h-3.5" />
              <p className="font-label">Top event types</p>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              All time
            </p>
          </div>
          {eventTypeSeries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">
              No inquiries yet
            </p>
          ) : (
            <ul className="space-y-2">
              {eventTypeSeries.map((d) => {
                const pct = (d.value / eventTypeMax) * 100;
                return (
                  <li
                    key={d.name}
                    className="flex items-center gap-3 text-[11px]"
                  >
                    <span className="w-20 capitalize truncate text-muted-foreground">
                      {d.name}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-medium tnum w-6 text-right">
                      {d.value}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Lead time histogram — how far ahead are hosts inquiring? */}
        <div className="card-soft p-3 md:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Timer className="w-3.5 h-3.5" />
              <p className="font-label">Booking lead time</p>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {leadTimeTotal} dated
            </p>
          </div>
          {leadTimeTotal === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">
              No dated inquiries yet
            </p>
          ) : (
            <div className="h-[90px] md:h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={leadTimeSeries}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  >
                    {leadTimeSeries.map((d) => (
                      <Cell
                        key={d.label}
                        fill={
                          d.count === leadTimePeak && d.count > 0
                            ? "hsl(var(--accent))"
                            : `hsl(var(--accent) / ${
                                leadTimePeak > 0
                                  ? 0.25 + (d.count / leadTimePeak) * 0.5
                                  : 0.25
                              })`
                        }
                      />
                    ))}
                  </Bar>
                  <XAxis
                    dataKey="label"
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
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

        {/* Inquiry budget — average + median + sample size, no chart,
            just numbers. Big bold value tile on purpose: this is the
            single most-asked-about number after total inquiries. */}
        <div className="card-soft p-3 md:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="w-3.5 h-3.5" />
              <p className="font-label">Avg inquiry budget</p>
            </div>
            {budgetSeries.count > 0 && (
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {budgetSeries.count} sampled
              </p>
            )}
          </div>
          {budgetSeries.count === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">
              No budget data yet
            </p>
          ) : (
            <div>
              <p className="font-display text-3xl tnum leading-none">
                {fmtBudget(budgetSeries.avg)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                Median{" "}
                <span className="font-medium tnum text-foreground">
                  {fmtBudget(budgetSeries.median)}
                </span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Average of (min+max)/2 across inquiries that supplied a
                range.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
