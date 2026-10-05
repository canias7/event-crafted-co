import i18n from "@/i18n";

/**
 * The locale for dates, times, numbers and money, following the SITE
 * language (not the browser's): US Spanish ("es-US": "7:05 p.m.",
 * "$1,234", "5 de oct") when the site is in Spanish — plain "es" would
 * give 24-hour clocks and "1234 US$" — and the browser's English variant
 * otherwise (en-US unless the browser is en-GB, en-CA…).
 */
export function intlLocale(): string {
  const language = i18n.resolvedLanguage ?? i18n.language ?? "en";
  if (language.startsWith("es")) return "es-US";
  const browser = typeof navigator !== "undefined" ? navigator.language : "en-US";
  return browser.toLowerCase().startsWith("en") ? browser : "en-US";
}
