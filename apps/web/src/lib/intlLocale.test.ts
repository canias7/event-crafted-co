import { describe, it, expect, vi, afterEach } from "vitest";

// The site language, as i18n reports it.
const site = vi.hoisted(() => ({ resolvedLanguage: "en", language: "en" }));
vi.mock("@/i18n", () => ({ default: site }));

import { intlLocale, moneyLocale, siteIsEnglish, siteLocaleOr } from "./intlLocale";
import { formatCents, formatDate, formatMinutes } from "./format";

function showSiteIn(language: string) {
  site.resolvedLanguage = language;
  site.language = language;
}

// ICU versions differ on which spaces they use (plain, no-break, narrow).
const plain = (text: string) => text.replace(/\s/g, " ");

afterEach(() => showSiteIn("en"));

describe("site locale", () => {
  it("keeps English pages on their own formats", () => {
    expect(siteIsEnglish()).toBe(true);
    expect(siteLocaleOr(undefined)).toBeUndefined();
    expect(siteLocaleOr("en-US")).toBe("en-US");
    expect(plain(formatMinutes(30))).toBe("30 min");
  });

  it("uses US Spanish in Spanish", () => {
    showSiteIn("es");
    expect(siteIsEnglish()).toBe(false);
    expect(intlLocale()).toBe("es-US");
    expect(moneyLocale()).toBe("es-US");
    expect(siteLocaleOr(undefined)).toBe("es-US");
    expect(formatCents(129900)).toBe("$1,299");
  });

  it("writes dates in Russian but keeps money in the US format", () => {
    showSiteIn("ru");
    expect(siteIsEnglish()).toBe(false);
    expect(intlLocale()).toBe("ru-RU");
    expect(siteLocaleOr("en-US")).toBe("ru-RU");
    expect(moneyLocale()).toBe("en-US");
    expect(formatCents(129900)).toBe("$1,299");
    expect(plain(formatDate("2026-10-05", "short"))).toBe("5 окт. 2026 г.");
    expect(plain(formatMinutes(30))).toBe("30 мин");
  });
});
