// Centralized formatters so dates, times, currency, and relative
// timestamps render consistently across the app. Pages that don't
// import these still work — but new code should.
//
// Locale defaults to the browser's preferred locale; users with
// "en-US" get US formats, "es-MX" gets Spanish, etc. We don't lock
// to en-US.

const DEFAULT_LOCALE = typeof navigator !== "undefined"
  ? navigator.language
  : "en-US";

// ─── Dates ───

export function formatDate(
  input: string | Date | null | undefined,
  style: "short" | "long" | "weekday" | "iso" = "long",
): string {
  if (!input) return "—";
  const d = parseInput(input);
  if (!d) return "—";
  if (style === "iso") return d.toISOString().slice(0, 10);
  if (style === "short") {
    return d.toLocaleDateString(DEFAULT_LOCALE, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (style === "weekday") {
    return d.toLocaleDateString(DEFAULT_LOCALE, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  return d.toLocaleDateString(DEFAULT_LOCALE, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Times ───

export function formatTime(
  input: string | Date | null | undefined,
): string {
  if (!input) return "—";
  const d = parseInput(input);
  if (!d) return "—";
  return d.toLocaleTimeString(DEFAULT_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTime(
  input: string | Date | null | undefined,
): string {
  if (!input) return "—";
  const d = parseInput(input);
  if (!d) return "—";
  return `${formatDate(d, "short")} · ${formatTime(d)}`;
}

// ─── Relative ───

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(
  input: string | Date | null | undefined,
): string {
  if (!input) return "—";
  const d = parseInput(input);
  if (!d) return "—";
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (abs < MINUTE) {
    value = Math.round(abs / SECOND) * sign;
    unit = "second";
  } else if (abs < HOUR) {
    value = Math.round(abs / MINUTE) * sign;
    unit = "minute";
  } else if (abs < DAY) {
    value = Math.round(abs / HOUR) * sign;
    unit = "hour";
  } else if (abs < 30 * DAY) {
    value = Math.round(abs / DAY) * sign;
    unit = "day";
  } else if (abs < 365 * DAY) {
    value = Math.round(abs / (30 * DAY)) * sign;
    unit = "month";
  } else {
    value = Math.round(abs / (365 * DAY)) * sign;
    unit = "year";
  }

  // RelativeTimeFormat is widely supported in modern browsers.
  return new Intl.RelativeTimeFormat(DEFAULT_LOCALE, {
    numeric: "auto",
  }).format(value, unit);
}

// ─── Currency ───

export function formatCents(
  cents: number | null | undefined,
  opts: { fallback?: string; currency?: string } = {},
): string {
  if (cents == null) return opts.fallback ?? "—";
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency: opts.currency ?? "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatCentsRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min == null && max == null) return "—";
  if (min == null) return `up to ${formatCents(max)}`;
  if (max == null) return `from ${formatCents(min)}`;
  if (min === max) return formatCents(min);
  return `${formatCents(min)} – ${formatCents(max)}`;
}

// ─── Helpers ───

function parseInput(input: string | Date): Date | null {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  // Date-only strings like "2026-05-04" are interpreted as UTC midnight by
  // the Date constructor — which renders as the previous day in negative
  // timezones. Force local-midnight parsing for date-only strings.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}
