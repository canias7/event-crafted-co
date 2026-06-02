import { describe, it, expect } from "vitest";
import { formatCents, formatCentsRange, formatFileSize } from "./format";

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
