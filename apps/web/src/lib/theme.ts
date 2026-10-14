// Light / dark theme for the website (owner's call, Oct 2026): light is
// the default; the switch in the top menu, the portal sidebars and the
// sign-in pages turns dark on and off. The choice is saved in
// localStorage ("vendora-theme") and index.html applies it before the
// first paint, so pages never flash the wrong colours.
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "vendora-theme";
const listeners = new Set<() => void>();

function read(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  return {
    theme,
    setTheme,
    toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
  };
}
