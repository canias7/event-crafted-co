// App languages: English, Spanish and Russian (owner's call, Oct 2026),
// the same three as the website. A small home-grown helper rather than
// i18next so the apps need no new packages (OTA-safe).
//
//   const { t } = useT("auth");      // in a component; re-renders on change
//   t("login.title")                 // -> locales/<lang>/auth.ts → login.title
//   t("inbox.count", { count: 3 })   // plurals: key_one / _few / _many / _other
//   i18n.t("common.cancel")          // outside components ("ns.key")
//
// Strings live in locales/<lang>/<namespace>.ts; every language has the
// same keys (Russian adds _few/_many plurals). Missing keys fall back to
// English, then to the key itself. The choice is saved on the device;
// with none saved, the phone's language is used when it's es or ru.
//
// Russian letters: the bundled LibreBaskerville-*.ttf files carry PT
// Serif's Cyrillic glyphs (merged in), so no font switch is needed.
import { useEffect, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RESOURCES } from "@/locales";

export type Lang = "en" | "es" | "ru";
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
];
const STORAGE_KEY = "vendora-lang";

function deviceLanguage(): Lang {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (loc.startsWith("es")) return "es";
    if (loc.startsWith("ru")) return "ru";
  } catch {
    // Intl missing: fall through to English.
  }
  return "en";
}

let current: Lang = deviceLanguage();
const listeners = new Set<() => void>();

export function getLanguage(): Lang {
  return current;
}

/** Read the saved choice; call once before the first render. */
export async function loadLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es" || saved === "ru") current = saved;
  } catch {
    // Storage unavailable: keep the device language.
  }
}

/** True once the saved choice is read; the root layout waits on it. */
export function useLanguageReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    loadLanguage().finally(() => setReady(true));
  }, []);
  return ready;
}

export function setLanguage(lang: Lang): void {
  current = lang;
  AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

type Vars = Record<string, string | number | null | undefined>;

function lookup(lang: Lang, path: string): unknown {
  const [ns, ...rest] = path.split(".");
  let node: unknown = (RESOURCES[lang] as Record<string, unknown>)[ns];
  for (const part of rest) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const pluralRules: Partial<Record<Lang, Intl.PluralRules>> = {};
function pluralForm(lang: Lang, count: number): string {
  try {
    pluralRules[lang] ??= new Intl.PluralRules(lang);
    return pluralRules[lang]!.select(count);
  } catch {
    return count === 1 ? "one" : "other";
  }
}

function resolve(lang: Lang, key: string, vars?: Vars): unknown {
  if (vars && typeof vars.count === "number") {
    const form = lookup(lang, `${key}_${pluralForm(lang, vars.count)}`);
    if (form !== undefined) return form;
    const other = lookup(lang, `${key}_other`);
    if (other !== undefined) return other;
  }
  return lookup(lang, key);
}

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) =>
    vars[name] === undefined || vars[name] === null ? m : String(vars[name]),
  );
}

/** Translate "namespace.path.to.key". */
export function translate(key: string, vars?: Vars, lang: Lang = current): string {
  let value = resolve(lang, key, vars);
  if (typeof value !== "string" && lang !== "en") value = resolve("en", key, vars);
  if (typeof value !== "string") return key;
  return interpolate(value, vars);
}

/** Arrays or objects of strings (e.g. a list of bullet points). */
export function translateObject<T = unknown>(key: string, lang: Lang = current): T {
  const value = lookup(lang, key);
  return (value === undefined && lang !== "en" ? lookup("en", key) : value) as T;
}

/** Locale for dates and numbers, matching the website (US Spanish, Russian). */
export function intlLocale(lang: Lang = current): string {
  return lang === "es" ? "es-US" : lang === "ru" ? "ru-RU" : "en-US";
}

export const i18n = {
  t: (key: string, vars?: Vars) => translate(key, vars),
  get language() {
    return current;
  },
};

/** Hook: re-renders when the language changes. */
export function useT(ns?: string) {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  const prefix = ns ? `${ns}.` : "";
  return {
    lang,
    t: (key: string, vars?: Vars) => translate(prefix + key, vars, lang),
    tObject: <T = unknown>(key: string) => translateObject<T>(prefix + key, lang),
    locale: intlLocale(lang),
  };
}
