// Shared rate-limit logic for the stale-chunk auto-heal that runs in
// two places: lazyWithReload (first-line defense) and ErrorBoundary
// (safety net for chunks loaded through bare React.lazy or anywhere
// else). Each layer passes its own scope so the two budgets compose.
//
// The rate limit is per failing chunk URL, not global. A user
// navigating across multiple stale-chunk pages each get one reload
// attempt per chunk — the previous global "once per 60s" rate limit
// stranded them on the snag screen the moment a second page hit a
// different stale chunk inside the window.
//
// The same chunk failing twice inside the window does suppress —
// that's the loop-prevention case (genuinely broken deploy where the
// reloaded index.html still references the missing chunk).

export const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk|Importing a module script failed|MIME type|Unexpected token '<'/i;

const RELOAD_WINDOW_MS = 60_000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err);
  return CHUNK_ERROR_PATTERN.test(msg);
}

// Extract the failing chunk URL from a chunk-load error message so we
// can rate-limit per-URL. The standard browser message contains the
// URL after "module: ". Falls back to a stable hash so we still
// dedupe on errors that don't include a URL.
function extractChunkKey(message: string): string {
  const match = message.match(/module:\s*(https?:\/\/\S+)/);
  if (match) return match[1];
  // No URL in the message — collapse repeated occurrences of the
  // same exact error string into a single rate-limit bucket.
  return message.slice(0, 200);
}

interface ReloadHistoryEntry {
  url: string;
  at: number;
}

type Scope = "lazy" | "boundary";

function storageKey(scope: Scope): string {
  return `vendora.chunkReload.${scope}`;
}

// Returns true if the caller should trigger window.location.reload().
// Records the attempt in sessionStorage so the next failure inside
// the same window for the same chunk URL gets suppressed.
export function shouldAutoReload(scope: Scope, message: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = storageKey(scope);
    const now = Date.now();
    const chunkKey = extractChunkKey(message);
    const raw = window.sessionStorage.getItem(key);
    const history: ReloadHistoryEntry[] = raw ? JSON.parse(raw) : [];
    // Drop entries older than the window — keeps the list small.
    const fresh = history.filter((e) => now - e.at <= RELOAD_WINDOW_MS);
    if (fresh.some((e) => e.url === chunkKey)) {
      // Already tried to reload for this exact chunk recently — bail.
      window.sessionStorage.setItem(key, JSON.stringify(fresh));
      return false;
    }
    fresh.push({ url: chunkKey, at: now });
    window.sessionStorage.setItem(key, JSON.stringify(fresh));
    return true;
  } catch {
    // sessionStorage can throw in private-mode Safari; bail out
    // without reloading so we don't end up in a hard loop.
    return false;
  }
}
