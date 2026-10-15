// The vendor Overview's date control (owner's call, Oct 2026): a quick
// pick (today, this week, this month, last 30 / 90 days, this year, last
// 12 months), any custom start–end dates, and "group by day / week /
// month" for the revenue chart. Everything on the Overview that reads a
// period (revenue, inquiries, cash flow, expenses) follows it; recent
// activity and upcoming appointments don't.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { siteLocaleOr } from "@/lib/intlLocale";

export const RANGE_PRESETS = [
  "today",
  "this_week",
  "this_month",
  "last_30",
  "last_90",
  "this_year",
  "last_12m",
  "custom",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export type RangeBucket = "day" | "week" | "month";

export interface OverviewRange {
  preset: RangePreset;
  from: Date; // local midnight, included
  to: Date; // local midnight, included
  bucket: RangeBucket;
}

// Longest custom range the server accepts (~3 years) and the longest it
// will split into days.
export const MAX_RANGE_DAYS = 1100;
export const MAX_DAY_BUCKETS = 400;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysInRange(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000) + 1;
}

// YYYY-MM-DD in local time (what the server's p_from / p_to expect).
export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function presetDates(preset: Exclude<RangePreset, "custom">): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "this_week": {
      // Weeks start on Monday, like the server's week buckets.
      const back = (today.getDay() + 6) % 7;
      return { from: new Date(y, m, today.getDate() - back), to: today };
    }
    case "this_month":
      return { from: new Date(y, m, 1), to: today };
    case "last_30":
      return { from: new Date(y, m, today.getDate() - 29), to: today };
    case "last_90":
      return { from: new Date(y, m, today.getDate() - 89), to: today };
    case "this_year":
      return { from: new Date(y, 0, 1), to: today };
    case "last_12m":
      return { from: new Date(y, m - 11, 1), to: today };
  }
}

// The grouping that reads best for a range of this length.
export function defaultBucket(from: Date, to: Date): RangeBucket {
  const n = daysInRange(from, to);
  if (n <= 45) return "day";
  if (n <= 180) return "week";
  return "month";
}

export function allowedBuckets(from: Date, to: Date): RangeBucket[] {
  return daysInRange(from, to) > MAX_DAY_BUCKETS ? ["week", "month"] : ["day", "week", "month"];
}

export function rangeFromPreset(preset: Exclude<RangePreset, "custom">): OverviewRange {
  const { from, to } = presetDates(preset);
  return { preset, from, to, bucket: defaultBucket(from, to) };
}

// "Oct 1 – Oct 15, 2026" (the year only once when both ends share it).
export function formatRangeDates(from: Date, to: Date): string {
  const loc = siteLocaleOr("en-US");
  const sameYear = from.getFullYear() === to.getFullYear();
  const end = to.toLocaleDateString(loc, { month: "short", day: "numeric", year: "numeric" });
  if (toIsoDate(from) === toIsoDate(to)) return end;
  const start = from.toLocaleDateString(loc, sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
}

// Saved per browser so the vendor's choice sticks between visits. Custom
// dates aren't kept (they'd go stale); a saved custom choice falls back
// to the last 30 days.
const STORE_KEY = "vendora-overview-range";

export function loadSavedRange(): OverviewRange {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { preset?: string; bucket?: string };
      if (saved.preset && saved.preset !== "custom" && (RANGE_PRESETS as readonly string[]).includes(saved.preset)) {
        const r = rangeFromPreset(saved.preset as Exclude<RangePreset, "custom">);
        const b = saved.bucket as RangeBucket | undefined;
        if (b && allowedBuckets(r.from, r.to).includes(b)) r.bucket = b;
        return r;
      }
    }
  } catch {
    /* no storage: use the default */
  }
  return rangeFromPreset("last_30");
}

function saveRange(r: OverviewRange) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ preset: r.preset, bucket: r.bucket }));
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

export function OverviewRangeBar({
  value,
  onChange,
}: {
  value: OverviewRange;
  onChange: (r: OverviewRange) => void;
}) {
  const { t } = useTranslation("vendorPayments");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({ from: value.from, to: value.to });
  const [tooLong, setTooLong] = useState(false);

  const apply = (r: OverviewRange) => {
    saveRange(r);
    onChange(r);
  };

  const pickPreset = (p: RangePreset) => {
    if (p === "custom") {
      setDraft({ from: value.from, to: value.to });
      setTooLong(false);
      setPickerOpen(true);
      return;
    }
    apply(rangeFromPreset(p));
  };

  const applyCustom = () => {
    if (!draft?.from) return;
    const from = startOfDay(draft.from);
    const to = startOfDay(draft.to ?? draft.from);
    if (daysInRange(from, to) > MAX_RANGE_DAYS) {
      setTooLong(true);
      return;
    }
    apply({ preset: "custom", from, to, bucket: defaultBucket(from, to) });
    setPickerOpen(false);
  };

  const buckets = allowedBuckets(value.from, value.to);
  const today = startOfDay(new Date());

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <Select value={value.preset} onValueChange={(v) => pickPreset(v as RangePreset)}>
        <SelectTrigger className="h-9 w-auto min-w-[150px] rounded-full text-sm font-bold" aria-label={t("range.label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {t(`range.presets.${p}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm text-foreground hover:text-accent transition-colors min-w-0"
            onClick={() => {
              setDraft({ from: value.from, to: value.to });
              setTooLong(false);
            }}
          >
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span className="truncate">{formatRangeDates(value.from, value.to)}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3 rounded-xl">
          <Calendar
            mode="range"
            selected={draft}
            onSelect={(r) => {
              setDraft(r);
              setTooLong(false);
            }}
            numberOfMonths={1}
            defaultMonth={draft?.from ?? value.from}
            disabled={{ after: today }}
            initialFocus
          />
          {tooLong ? (
            <p className="mt-1 text-xs text-destructive">{t("range.too_long")}</p>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {draft?.from ? formatRangeDates(draft.from, draft.to ?? draft.from) : t("range.pick_start")}
            </span>
            <button
              type="button"
              disabled={!draft?.from}
              onClick={applyCustom}
              className="rounded-full bg-gold px-4 h-9 text-sm font-bold text-ink hover:bg-gold-hover disabled:bg-gold-muted"
            >
              {t("range.apply")}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="inline-flex rounded-full border border-border p-0.5 ml-auto" role="group" aria-label={t("range.group_by")}>
        {(["day", "week", "month"] as const).map((b) => {
          const ok = buckets.includes(b);
          return (
            <button
              key={b}
              type="button"
              disabled={!ok}
              aria-pressed={value.bucket === b}
              onClick={() => apply({ ...value, bucket: b })}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                value.bucket === b
                  ? "bg-primary text-primary-foreground"
                  : ok
                    ? "text-foreground hover:text-accent"
                    : "text-muted-foreground opacity-50 cursor-not-allowed"
              }`}
            >
              {t(`range.buckets.${b}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
