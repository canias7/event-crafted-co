import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatCents,
  formatCentsRange,
  formatFileSize,
  formatRelative,
} from "./format";

describe("formatCents", () => {
  it("returns the fallback for null/undefined", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
    expect(formatCents(null, { fallback: "n/a" })).toBe("n/a");
  });

  it("drops the decimals for round dollar amounts, keeps them otherwise", () => {
    expect(formatCents(25000)).toBe("$250");
    expect(formatCents(129900)).toBe("$1,299");
    // minimumFractionDigits is 0, so a trailing zero is dropped ($125.5, not $125.50).
    expect(formatCents(12550)).toBe("$125.5");
    expect(formatCents(12525)).toBe("$125.25");
    expect(formatCents(99)).toBe("$0.99");
  });
});

describe("formatCentsRange", () => {
  it("handles open, closed, and equal ranges", () => {
    expect(formatCentsRange(null, null)).toBe("—");
    expect(formatCentsRange(null, 5000)).toBe("up to $50");
    expect(formatCentsRange(5000, null)).toBe("from $50");
    expect(formatCentsRange(5000, 5000)).toBe("$50");
    expect(formatCentsRange(5000, 10000)).toBe("$50 – $100");
  });
});

describe("formatFileSize", () => {
  it("scales through B / KB / MB / GB", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatFileSize(1024 ** 3)).toBe("1.0 GB");
  });
});

describe("formatRelative", () => {
  afterEach(() => vi.useRealTimers());

  it("picks the right unit relative to now (past + future)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    const ago = (ms: number) => new Date(Date.now() - ms);
    expect(formatRelative(ago(30_000))).toBe("30 seconds ago");
    expect(formatRelative(ago(2 * 60 * 60_000))).toBe("2 hours ago");
    expect(formatRelative(ago(26 * 60 * 60_000))).toBe("yesterday");
    expect(formatRelative(new Date(Date.now() + 3 * 24 * 60 * 60_000))).toBe("in 3 days");
  });

  it("returns the fallback for empty / unparseable / out-of-range input", () => {
    expect(formatRelative(null)).toBe("—");
    expect(formatRelative(undefined)).toBe("—");
    expect(formatRelative("not a date")).toBe("—");
    expect(formatRelative("2026-13-45")).toBe("—"); // rejected before Date rolls it forward
  });
});
