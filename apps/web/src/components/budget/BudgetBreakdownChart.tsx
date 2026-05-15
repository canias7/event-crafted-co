import { useMemo } from "react";
import { PieChart as PieIcon } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCents } from "@/lib/format";

// Donut breakdown of planned spend per category. Reads the same
// budget rows the line list shows; renders nothing when there are
// fewer than 2 categories (a chart of one slice is just a circle).

interface Row {
  category: string | null;
  amount_cents: number;
  paid_cents: number;
}

// Hand-picked palette that reads well on both light and dark
// surfaces and avoids using accent (which we reserve for CTAs).
const PALETTE = [
  "hsl(30 35% 55%)",
  "hsl(180 25% 50%)",
  "hsl(280 25% 60%)",
  "hsl(140 25% 50%)",
  "hsl(20 50% 55%)",
  "hsl(220 30% 55%)",
  "hsl(340 30% 60%)",
  "hsl(60 35% 50%)",
];

const UNCATEGORIZED = "Uncategorized";

export function BudgetBreakdownChart({ rows }: { rows: Row[] }) {
  const data = useMemo(() => {
    const byCategory = new Map<string, { planned: number; paid: number }>();
    for (const r of rows) {
      const key = r.category?.trim() || UNCATEGORIZED;
      const prev = byCategory.get(key) ?? { planned: 0, paid: 0 };
      prev.planned += r.amount_cents;
      prev.paid += r.paid_cents;
      byCategory.set(key, prev);
    }
    return Array.from(byCategory.entries())
      .map(([name, { planned, paid }]) => ({ name, planned, paid }))
      .filter((d) => d.planned > 0)
      .sort((a, b) => b.planned - a.planned);
  }, [rows]);

  const totalPlanned = data.reduce((sum, d) => sum + d.planned, 0);
  const totalPaid = data.reduce((sum, d) => sum + d.paid, 0);
  const remaining = Math.max(0, totalPlanned - totalPaid);

  if (data.length < 2) return null;

  return (
    <div className="card-soft p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-4">
        <PieIcon className="w-3.5 h-3.5" />
        <p className="font-label">Planned spend by category</p>
      </div>
      <div className="grid md:grid-cols-[260px_1fr] gap-6 items-center">
        <div className="relative h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="planned"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((d, i) => (
                  <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <RTooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 4,
                  fontSize: 12,
                }}
                formatter={(value: number) => formatCents(value)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Planned
            </p>
            <p className="font-display text-xl tnum">
              {formatCents(totalPlanned)}
            </p>
          </div>
        </div>

        <ul className="space-y-1.5 text-sm">
          {data.map((d, i) => {
            const pct = totalPlanned
              ? Math.round((d.planned / totalPlanned) * 100)
              : 0;
            return (
              <li
                key={d.name}
                className="flex items-center gap-3 text-xs"
              >
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                  aria-hidden
                />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="text-muted-foreground tnum">{pct}%</span>
                <span className="font-medium tnum tabular-nums w-20 text-right">
                  {formatCents(d.planned)}
                </span>
              </li>
            );
          })}
          <li className="pt-3 mt-3 border-t border-border flex items-center gap-3 text-xs">
            <span className="flex-1 text-muted-foreground">Paid to date</span>
            <span className="font-medium tnum tabular-nums w-20 text-right">
              {formatCents(totalPaid)}
            </span>
          </li>
          <li className="flex items-center gap-3 text-xs">
            <span className="flex-1 text-muted-foreground">Remaining</span>
            <span className="font-medium tnum tabular-nums w-20 text-right">
              {formatCents(remaining)}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
