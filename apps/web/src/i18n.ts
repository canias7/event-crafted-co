import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "@/locales/en/common.json";
import es from "@/locales/es/common.json";

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
    resources: {
      en: { common: en },
      es: { common: es },
    },
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

export default i18n;
