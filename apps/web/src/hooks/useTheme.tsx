import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeCtx {
  /** What the user picked. "system" means follow OS. */
  preference: ThemePreference;
  /** What's actually applied right now. */
  resolved: "light" | "dark";
  setPreference: (p: ThemePreference) => void;
}

const Ctx = createContext<ThemeCtx>({
  preference: "system",
  resolved: "light",
  setPreference: () => {},
});

const STORAGE_KEY = "vendora-theme-preference";

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  // localStorage can throw in Safari private browsing and when the
  // storage quota is exhausted. The theme toggle isn't worth a hard
  // crash — fall back to system preference.
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // ignore — system default
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // Tells form controls + scrollbars to match.
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);

  // Hydrate from localStorage + system on mount.
  useEffect(() => {
    setPreferenceState(readPreference());
    setSystemDark(systemPrefersDark());
  }, []);

  // Listen to system pref changes when user is on "system".
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = useMemo(() => {
    if (preference === "system") return systemDark ? "dark" : "light";
    return preference;
  }, [preference, systemDark]);

  // Apply class + colorScheme whenever resolved changes.
  useEffect(() => {
    apply(resolved);
  }, [resolved]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // private browsing / storage full — preference still applies
      // for the current session via the React state above.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
