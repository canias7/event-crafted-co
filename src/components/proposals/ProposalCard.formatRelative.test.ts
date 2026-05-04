import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// formatRelative is a private helper inside ProposalCard.tsx.
// Re-implementing the same logic here as a smoke check that the
// boundary cases stay sensible. If the component changes, this test
// goes stale fast, but for now it documents the behavior we want.

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

describe("formatRelative (proposal viewed)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' under 30 seconds (rounding boundary)", () => {
    expect(formatRelative("2026-05-04T11:59:50Z")).toBe("just now");
  });

  it("returns minutes when under an hour", () => {
    expect(formatRelative("2026-05-04T11:55:00Z")).toBe("5m ago");
  });

  it("returns hours when under a day", () => {
    expect(formatRelative("2026-05-04T09:00:00Z")).toBe("3h ago");
  });

  it("returns days when under a week", () => {
    expect(formatRelative("2026-05-02T12:00:00Z")).toBe("2d ago");
  });

  it("falls back to a date string for older", () => {
    const out = formatRelative("2026-04-01T12:00:00Z");
    expect(out).not.toMatch(/ago/);
    expect(out.length).toBeGreaterThan(4);
  });
});
