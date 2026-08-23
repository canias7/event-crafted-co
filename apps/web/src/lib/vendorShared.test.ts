// The setup checklist and the changelog are now shared between the app
// and the website. These assert the contracts both surfaces render
// against — a malformed entry would otherwise only show up as a broken
// row on one of them.
import { describe, expect, it, afterEach, vi } from "vitest";
import { COMING, LATEST_UPDATE_AT, SHIPPED, hasFreshUpdate } from "@vendora/core";

describe("vendor changelog", () => {
  afterEach(() => vi.useRealTimers());

  it("every shipped entry is renderable", () => {
    expect(SHIPPED.length).toBeGreaterThan(0);
    for (const u of SHIPPED) {
      expect(u.date.trim()).not.toBe("");
      expect(u.title.trim()).not.toBe("");
      expect(u.body.trim()).not.toBe("");
    }
  });

  it("coming-next entries are non-empty strings", () => {
    expect(COMING.length).toBeGreaterThan(0);
    for (const c of COMING) expect(c.trim()).not.toBe("");
  });

  it("LATEST_UPDATE_AT is a real date", () => {
    expect(Number.isNaN(new Date(LATEST_UPDATE_AT).getTime())).toBe(false);
  });

  it("the New badge turns on and off around the 21-day window", () => {
    const stamp = new Date(LATEST_UPDATE_AT).getTime();
    const day = 24 * 3600_000;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(stamp + 20 * day));
    expect(hasFreshUpdate()).toBe(true);

    vi.setSystemTime(new Date(stamp + 22 * day));
    expect(hasFreshUpdate()).toBe(false);
  });
});
