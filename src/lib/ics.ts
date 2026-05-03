// Minimal RFC 5545 .ics file builder for client-side calendar exports.
// No subscribe feed — just downloadable single-event files (and small
// multi-event files for the future). Add-to-calendar handlers all
// produce these.

interface IcsEvent {
  uid: string;
  // Either provide start + (end | durationMinutes) for timed events,
  // or set allDay = true and provide a startDate (Date) — the file will
  // emit VALUE=DATE.
  start: Date;
  end?: Date;
  durationMinutes?: number;
  allDay?: boolean;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toUtcStamp(d: Date) {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

function toDateValue(d: Date) {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

// RFC 5545: escape commas, semicolons, backslashes, and newlines.
function escapeText(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// Wrap long lines at 75 octets per RFC 5545. Keeps Outlook + iOS Calendar
// happy on long descriptions.
function fold(line: string) {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + 75);
    out.push(i === 0 ? chunk : ` ${chunk}`);
    i += 75;
  }
  return out.join("\r\n");
}

function eventBlock(e: IcsEvent): string {
  const dtstamp = toUtcStamp(new Date());
  const lines: string[] = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${dtstamp}`];

  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toDateValue(e.start)}`);
    if (e.end) {
      lines.push(`DTEND;VALUE=DATE:${toDateValue(e.end)}`);
    } else {
      // Single all-day: DTEND is exclusive, so add one day
      const next = new Date(e.start);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${toDateValue(next)}`);
    }
  } else {
    lines.push(`DTSTART:${toUtcStamp(e.start)}`);
    const end =
      e.end ??
      (e.durationMinutes
        ? new Date(e.start.getTime() + e.durationMinutes * 60_000)
        : new Date(e.start.getTime() + 60 * 60_000));
    lines.push(`DTEND:${toUtcStamp(end)}`);
  }

  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push("END:VEVENT");

  return lines.map(fold).join("\r\n");
}

export function buildIcs(events: IcsEvent[]): string {
  const header = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vendora//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const footer = ["END:VCALENDAR"];
  return [...header, ...events.map(eventBlock), ...footer].join("\r\n");
}

export function downloadIcs(filename: string, events: IcsEvent[]) {
  const ics = buildIcs(events);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Filename-safe slug for output files.
export function slugForFile(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}
