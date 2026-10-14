// Light / dark theme for the app (owner's call, Oct 2026). Light is the
// default; Settings has a Dark mode switch. Screens read their colours
// from `C` when their module loads, so switching saves the choice and
// restarts the JS (a second or so) instead of re-rendering every screen.
//
//   import { C } from "@/lib/theme";
//   const INK = C.text;            // module-level constants are fine
//
// The choice is read synchronously from SecureStore at start-up, so the
// first frame is already in the right theme.
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { DevSettings } from "react-native";

const KEY = "vendora-theme";

function readSaved(): boolean {
  try {
    return SecureStore.getItem(KEY) === "dark";
  } catch {
    return false;
  }
}

export const IS_DARK = readSaved();

const LIGHT = {
  /** Ivory page. */
  page: "#f4f1ea",
  /** Cream card / raised surface. */
  card: "#fbf9f4",
  /** Chips, neutral pills, tracks, received bubbles. */
  surface: "#ece7db",
  /** Inputs and secondary buttons (white in light). */
  field: "#ffffff",
  /** The one hairline. */
  border: "#e6e1d5",
  /** All text. */
  text: "#14161a",
  /** Secondary text (still ink in light: no grey text). */
  textDim: "#14161a",
  /** Gold text: bronze on light, champagne on dark. */
  accentText: "#8a6f3e",
  /** Champagne fills, ornaments, unread dots. */
  gold: "#c9a86a",
  /** Disabled primary button fill. */
  goldMuted: "#e0d2b0",
  /** Label on gold / cream fills (never changes). */
  onGold: "#14161a",
  /** Selected state fill (ink in light, cream in dark) and its label. */
  selected: "#14161a",
  onSelected: "#ffffff",
  placeholder: "#746a58",
  error: "#b23a34",
  /** "Waiting" tint and its text. */
  pending: "#f2e7cb",
  pendingText: "#8a6f3e",
  /** Status bar / keyboard style. */
  statusBar: "dark" as "dark" | "light",
};

const DARK: typeof LIGHT = {
  page: "#14161a",
  card: "#1c1f24",
  surface: "#272a30",
  field: "#22252b",
  border: "rgba(255,255,255,0.15)",
  text: "#f4f1ea",
  textDim: "#ddd6c8",
  accentText: "#c9a86a",
  gold: "#c9a86a",
  goldMuted: "#e0d2b0",
  onGold: "#14161a",
  selected: "#f4f1ea",
  onSelected: "#14161a",
  placeholder: "#a39a88",
  error: "#e0716a",
  pending: "#3a3427",
  pendingText: "#c9a86a",
  statusBar: "light",
};

/** The active palette (fixed for the life of the JS bundle). */
export const C = IS_DARK ? DARK : LIGHT;

/** Save the choice and restart the JS so every screen picks it up. */
export async function setDarkMode(dark: boolean): Promise<void> {
  if (dark === IS_DARK) return;
  try {
    await SecureStore.setItemAsync(KEY, dark ? "dark" : "light");
  } catch {
    return;
  }
  try {
    await Updates.reloadAsync();
  } catch {
    // Development builds: expo-updates may be off.
    DevSettings.reload();
  }
}
