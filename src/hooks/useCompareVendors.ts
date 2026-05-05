import { useEffect, useState, useCallback } from "react";

// Side-by-side vendor comparison shortlist. Stored in localStorage so
// it works for anonymous browsers (no auth required) and persists
// across the same-device session. Capped at 4 to keep the comparison
// page readable on mobile.

const STORAGE_KEY = "vendora.compareList";
const MAX_COMPARE = 4;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event("compare-list-changed"));
  } catch {
    // Quota errors etc. — silently ignore.
  }
}

export function useCompareVendors() {
  const [ids, setIds] = useState<string[]>(() => read());

  useEffect(() => {
    function sync() {
      setIds(read());
    }
    window.addEventListener("compare-list-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("compare-list-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isCompared = useCallback(
    (id: string) => ids.includes(id),
    [ids],
  );

  const toggle = useCallback((id: string) => {
    const current = read();
    let next: string[];
    if (current.includes(id)) {
      next = current.filter((x) => x !== id);
    } else if (current.length >= MAX_COMPARE) {
      // Replace oldest to keep the slot count predictable.
      next = [...current.slice(1), id];
    } else {
      next = [...current, id];
    }
    write(next);
    setIds(next);
  }, []);

  const clear = useCallback(() => {
    write([]);
    setIds([]);
  }, []);

  return { ids, isCompared, toggle, clear, max: MAX_COMPARE };
}
