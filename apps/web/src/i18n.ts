import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Every JSON file under locales/<language>/ is a namespace:
// locales/es/explore.json is the "explore" namespace in Spanish, read
// with useTranslation("explore"). "common" is the default. Add a page's
// strings as its own file in BOTH en/ and es/; nothing to register here.
const localeFiles = import.meta.glob<{ default: Record<string, unknown> }>(
  "./locales/*/*.json",
  { eager: true },
);
const resources: Resource = {};
for (const [path, file] of Object.entries(localeFiles)) {
  const match = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, language, namespace] = match;
  (resources[language] ??= {})[namespace] = file.default;
}

// i18n setup. Detection chain runs in order:
//   1. ?lang=es querystring  (sticky for testing)
//   2. localStorage('vendora-lang')
//   3. navigator.language (browser / OS preferred)
//   4. <html lang="…">
// Fallback: English.
//
// Authenticated users with profiles.preferred_language set get that
// applied on login via useAuth — that takes precedence by being
// written to localStorage right after sign-in.

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    ns: Object.keys(resources.en ?? {}),
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true, // accept "es-MX" → "es"
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

// Keep <html lang> in step with the chosen language, for screen readers,
// spell-check and the browser's own translate prompt, and swap the
// site-wide default title and description (pages that don't set their
// own show them) wherever one is showing.
type MetaKey = "defaultTitle" | "defaultDescription";
const metaDefaults = (key: MetaKey) =>
  Object.values(resources)
    .map((r) => (r.meta as Partial<Record<MetaKey, string>> | undefined)?.[key])
    .filter((text): text is string => Boolean(text));
const defaultTitles = metaDefaults("defaultTitle");
const defaultDescriptions = metaDefaults("defaultDescription");
const DEFAULT_META_TAGS: [selector: string, defaults: string[], key: MetaKey][] = [
  ['meta[property="og:title"]', defaultTitles, "defaultTitle"],
  ['meta[name="twitter:title"]', defaultTitles, "defaultTitle"],
  ['meta[name="description"]', defaultDescriptions, "defaultDescription"],
  ['meta[property="og:description"]', defaultDescriptions, "defaultDescription"],
  ['meta[name="twitter:description"]', defaultDescriptions, "defaultDescription"],
];
const followLanguage = (language: string) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language.split("-")[0];
  if (defaultTitles.includes(document.title)) document.title = i18n.t("defaultTitle", { ns: "meta" });
  for (const [selector, defaults, key] of DEFAULT_META_TAGS) {
    const tag = document.querySelector<HTMLMetaElement>(selector);
    if (tag && defaults.includes(tag.content)) tag.content = i18n.t(key, { ns: "meta" });
  }
};
i18n.on("languageChanged", followLanguage);
if (i18n.resolvedLanguage) followLanguage(i18n.resolvedLanguage);

export default i18n;
