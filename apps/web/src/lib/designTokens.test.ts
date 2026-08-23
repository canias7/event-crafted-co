// Guards the one thing that has drifted repeatedly: web's CSS custom
// properties and the shared token module describing the same color
// differently.
//
// Web authors its palette as HSL triplets in index.css (it needs alpha
// variants and gradients that a flat hex map can't express), while the
// mobile Tailwind configs read hex from packages/core. Both are
// legitimate, so rather than force one representation this test asserts
// they resolve to the same color. Change a value in one place and this
// fails, instead of the two surfaces silently diverging for months.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const tokens = require("../../../../packages/core/src/tokens.js") as {
  surface: Record<string, string>;
  ink: Record<string, string>;
  gold: Record<string, string>;
};

const css = readFileSync(path.resolve(__dirname, "../index.css"), "utf8");

/** Pull `--name: H S% L%;` out of index.css's :root block. */
function cssVarToHex(name: string): string {
  const m = new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;`).exec(css);
  if (!m) throw new Error(`--${name} not found in index.css`);
  return hslToHex(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Rounding between HSL and hex costs up to a step per channel. */
function expectSameColor(a: string, b: string) {
  const ch = (s: string) =>
    [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [x, y] = [ch(a), ch(b)];
  x.forEach((v, i) => expect(Math.abs(v - y[i])).toBeLessThanOrEqual(1));
}

describe("web CSS vars match the shared design tokens", () => {
  it("card surface", () => expectSameColor(cssVarToHex("card"), tokens.surface.card));
  it("ink / foreground", () => expectSameColor(cssVarToHex("foreground"), tokens.ink.DEFAULT));
  it("muted foreground", () => expectSameColor(cssVarToHex("muted-foreground"), tokens.ink.dim));

  it("accent is the readable bronze, not ornamental champagne", () => {
    expectSameColor(cssVarToHex("accent"), tokens.gold.ink);
    expect(tokens.gold.ink).not.toBe(tokens.gold.DEFAULT);
  });

  it("champagne is only ever ornament or on dark — never a text token", () => {
    // 2.15:1 on cream. If this ends up as --accent, gold text across the
    // web app silently drops below the AA minimum.
    expect(cssVarToHex("accent")).not.toBe(tokens.gold.DEFAULT);
  });
});
