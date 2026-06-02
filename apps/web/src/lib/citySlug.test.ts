import { describe, it, expect } from "vitest";
import { citySlugify, citySlugDisplay } from "./citySlug";

describe("citySlugify", () => {
  it("lowercases, strips commas, and hyphenates", () => {
    expect(citySlugify("Brooklyn, NY")).toBe("brooklyn-ny");
    expect(citySlugify("San Antonio, TX")).toBe("san-antonio-tx");
  });

  it("collapses extra whitespace/hyphens and trims", () => {
    expect(citySlugify("  Round   Rock , TX ")).toBe("round-rock-tx");
  });

  it("drops non-ascii characters", () => {
    expect(citySlugify("Café Münster")).toBe("caf-mnster");
  });
});

describe("citySlugDisplay", () => {
  it("rebuilds the label, treating a 2-letter tail as a state code", () => {
    expect(citySlugDisplay("brooklyn-ny")).toBe("Brooklyn, NY");
    expect(citySlugDisplay("san-antonio-tx")).toBe("San Antonio, TX");
  });

  it("handles city-only slugs (no state code)", () => {
    expect(citySlugDisplay("austin")).toBe("Austin");
  });

  it("round-trips with citySlugify", () => {
    expect(citySlugDisplay(citySlugify("Brooklyn, NY"))).toBe("Brooklyn, NY");
  });
});
