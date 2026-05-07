import { lazy, Suspense, useEffect, useState } from "react";

// Lazy CommandPalette mount: keeps the heavy palette code (icons,
// cmdk dialog, vendor + inspiration data fetches inside CommandPalette
// itself) out of the initial bundle. The tiny launcher below listens
// for ⌘K / Ctrl+K and only kicks off the dynamic import on first press
// — most users never open the palette, so they never download it.

const CommandPalette = lazy(() =>
  import("@/components/CommandPalette").then((m) => ({ default: m.CommandPalette })),
);

export function CommandPaletteLauncher() {
  // Once the user has triggered the palette once, keep it mounted so
  // subsequent opens are instant. Initial state is `false` so cold
  // loads don't pull the chunk.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setArmed(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!armed) return null;
  return (
    <Suspense fallback={null}>
      {/* initialOpen handles the lazy-mount race: the first Cmd-K that
          fires the launcher arrives before CommandPalette's own keydown
          listener has registered, so we open the dialog from props. */}
      <CommandPalette initialOpen />
    </Suspense>
  );
}
