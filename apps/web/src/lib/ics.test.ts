import { describe, it, expect } from "vitest";
import { buildIcs, slugForFile } from "./ics";

// buildIcs stamps everything in UTC (getUTC*), so output is independent of
// the test runner's timezone.

describe("buildIcs", () => {
  it("wraps a timed event with a default 1h end and escapes text", () => {
    const ics = buildIcs([
      {
        uid: "evt-1",
        start: new Date("2026-07-04T15:00:00Z"),
        summary: "Tasting, deposit; due",
      },
    ]);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:evt-1");
    expect(ics).toContain("DTSTART:20260704T150000Z");
    expect(ics).toContain("DTEND:20260704T160000Z"); // default +60 min
    expect(ics).toContain("SUMMARY:Tasting\\, deposit\\; due"); // escaped , ;
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("emits VALUE=DATE for all-day events with an exclusive next-day end", () => {
    const ics = buildIcs([
      {
        uid: "d1",
        start: new Date("2026-07-04T00:00:00Z"),
        allDay: true,
        summary: "Wedding",
      },
    ]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260704");
    expect(ics).toContain("DTEND;VALUE=DATE:20260705");
  });
});

describe("slugForFile", () => {
  it("lowercases, collapses non-alphanumerics to hyphens, and trims", () => {
    expect(slugForFile("Wedding Photos!")).toBe("wedding-photos");
    expect(slugForFile("  Hello, World  ")).toBe("hello-world");
  });
});
