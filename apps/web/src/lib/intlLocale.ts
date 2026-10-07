import i18n from "@/i18n";

const siteLanguage = () => i18n.resolvedLanguage ?? i18n.language ?? "en";

/**
 * The locale for dates, times, numbers and money, following the SITE
 * language (not the browser's): US Spanish ("es-US": "7:05 p.m.",
 * "$1,234", "5 de oct") when the site is in Spanish — plain "es" would
 * give 24-hour clocks and "1234 US$" — Russian ("ru-RU": "19:05",
 * "1 234,00 $", "5 окт.") in Russian, and the browser's English variant
 * otherwise (en-US unless the browser is en-GB, en-CA…).
 */
export function intlLocale(): string {
  const language = siteLanguage();
  if (language.startsWith("es")) return "es-US";
  if (language.startsWith("ru")) return "ru-RU";
  const browser = typeof navigator !== "undefined" ? navigator.language : "en-US";
  return browser.toLowerCase().startsWith("en") ? browser : "en-US";
}

/**
 * The locale for money. Prices are US dollars and keep the US format
 * ($1,234.50) in Russian, matching the prices on listings, the PDFs
 * vendors send and Stripe's receipts; otherwise the same as intlLocale()
 * (US Spanish already writes money that way).
 */
export function moneyLocale(): string {
  return siteLanguage().startsWith("ru") ? "en-US" : intlLocale();
}

/** True while the site shows in English. */
export function siteIsEnglish(): boolean {
  return siteLanguage().startsWith("en");
}

/**
 * For places that kept their own English format before the site had
 * other languages: `english` while the site is in English (undefined =
 * the browser's default, or a fixed "en-US"), intlLocale() in any other
 * language.
 */
export function siteLocaleOr<T extends string | undefined>(english: T): string | T {
  return siteIsEnglish() ? english : intlLocale();
}
