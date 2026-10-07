import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import english from "./locales/en";
import type { LanguageBundle } from "./locales/bundle";

// Every JSON file under locales/<language>/ is a namespace:
// locales/es/explore.json is the "explore" namespace in Spanish, read
// with useTranslation("explore"). "common" is the default. Add a page's
// strings as its own file in EVERY language folder (en/, es/, ru/);
// nothing to register here.
//
// English is bundled with the app (it's the default and the fallback).
// Other languages are a chunk each (locales/<language>.ts), fetched the
// first time someone reads the site in that language, so English
// visitors don't download the Spanish or Russian text.
const LAZY_LANGUAGES: Record<string, () => Promise<{ default: LanguageBundle }>> = {
  es: () => import("./locales/es"),
  ru: () => import("./locales/ru"),
};

// i18n setup. Detection chain runs in order:
//   1. ?lang=es / ?lang=ru querystring  (sticky for testing)
//   2. localStorage('vendora-lang')
//   3. navigator.language (browser / OS preferred)
//   4. <html lang="…">
// Fallback: English.

export const SUPPORTED_LANGUAGES = ["en", "es", "ru"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
  ru: "Русский",
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: english },
    ns: Object.keys(english),
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true, // accept "es-MX" → "es", "ru-RU" → "ru"
    defaultNS: "common",
    interpolation: { escapeValue: false }, // React handles escaping
    detection: {
      order: ["querystring", "localStorage", "navigator", "htmlTag"],
      lookupQuerystring: "lang",
      lookupLocalStorage: "vendora-lang",
      caches: ["localStorage"],
    },
    react: { useSuspense: false },
  });

const baseLanguage = (language: string) => language.split("-")[0];
const needsLoading = (language: string) =>
  baseLanguage(language) in LAZY_LANGUAGES && !i18n.hasResourceBundle(baseLanguage(language), "common");

const loading = new Map<string, Promise<void>>();

/** Fetches a language's strings, unless they're bundled or already here. */
export function loadLanguage(language: string): Promise<void> {
  if (!needsLoading(language)) return Promise.resolve();
  const base = baseLanguage(language);
  let pending = loading.get(base);
  if (!pending) {
    pending = LAZY_LANGUAGES[base]()
      .then(({ default: bundle }) => {
        for (const [namespace, strings] of Object.entries(bundle)) {
          i18n.addResourceBundle(base, namespace, strings, true, true);
        }
        // Until now this language fell back to English; announce it
        // again so everything on screen re-renders in it.
        if (baseLanguage(i18n.language) === base) void i18n.changeLanguage(i18n.language);
      })
      .catch((error: unknown) => {
        loading.delete(base); // the next switch tries again
        throw error;
      });
    loading.set(base, pending);
  }
  return pending;
}

/** The language switcher's change: fetch the strings first, so the page
 *  changes in one go. Offline, it switches anyway (English shows until
 *  the strings arrive). */
export function changeLanguage(language: SupportedLanguage) {
  return loadLanguage(language)
    .catch(() => undefined)
    .then(() => i18n.changeLanguage(language));
}

// A language chosen any other way that isn't loaded yet.
i18n.on("languageChanged", (language) => {
  loadLanguage(language).catch(() => undefined);
});

/** Resolves once the visitor's language is ready to show: straight away
 *  for English, after its chunk for Spanish or Russian. main.tsx renders after it,
 *  so the first paint is in the right language. Never rejects; after a
 *  few seconds it stops waiting (the page shows in English and switches
 *  when the strings arrive). */
export const i18nReady = new Promise<void>((resolve) => {
  const language = i18n.language ?? "en";
  if (!needsLoading(language)) return resolve();
  loadLanguage(language).then(resolve, () => resolve());
  setTimeout(resolve, 4000);
});

// Keep <html lang> in step with the chosen language, for screen readers,
// spell-check and the browser's own translate prompt, and swap the
// site-wide default title and description (pages that don't set their
// own show them) wherever one is showing.
type MetaKey = "defaultTitle" | "defaultDescription";
const metaDefaults = (key: MetaKey) =>
  SUPPORTED_LANGUAGES.map((language) => i18n.getResource(language, "meta", key) as unknown)
    .filter((text): text is string => typeof text === "string" && text !== "");
const DEFAULT_META_TAGS: [selector: string, key: MetaKey][] = [
  ['meta[property="og:title"]', "defaultTitle"],
  ['meta[name="twitter:title"]', "defaultTitle"],
  ['meta[name="description"]', "defaultDescription"],
  ['meta[property="og:description"]', "defaultDescription"],
  ['meta[name="twitter:description"]', "defaultDescription"],
];
const followLanguage = (language: string) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = baseLanguage(language);
  if (metaDefaults("defaultTitle").includes(document.title)) {
    document.title = i18n.t("defaultTitle", { ns: "meta" });
  }
  for (const [selector, key] of DEFAULT_META_TAGS) {
    const tag = document.querySelector<HTMLMetaElement>(selector);
    if (tag && metaDefaults(key).includes(tag.content)) tag.content = i18n.t(key, { ns: "meta" });
  }
};
i18n.on("languageChanged", followLanguage);
if (i18n.language) followLanguage(i18n.language);

export default i18n;
