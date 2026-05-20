// Cross-origin-safe download + image-loading helpers for the
// gallery.
//
// The Supabase Storage public URL is cross-origin to the app, so:
//   • `<a href="...storage..." download>` ignores the download
//     attribute and just navigates the browser to the image.
//   • An <img crossOrigin="anonymous"> source loaded from there
//     taints the canvas — toDataURL() and getImageData() throw.
//
// Both fixes route through fetch → blob → URL.createObjectURL.
// The resulting blob URL is same-origin to the app, so downloads
// honor the filename and canvas ops are clean.
//
// Streaming-fetch shape: both helpers accept an optional
// `onProgress(received, total)` callback. `total` is the
// Content-Length header (may be 0 if the server doesn't send it).

export interface ProgressCallback {
  (received: number, total: number): void;
}

// Wall-clock cap for the entire fetch + stream. On flaky 3G the
// stream can stall mid-download without the request ever erroring,
// so wrap everything in an AbortController and reject after 30s.
// A successful headers-only response that then stops streaming
// counts against the same budget — exactly the case we want to bail
// out of, since the user is otherwise stuck on a frozen spinner.
const FETCH_TIMEOUT_MS = 30_000;

async function fetchAsBlob(
  url: string,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Couldn't fetch image (${res.status})`);
    }
    // Fall back to the simple blob() path if the response isn't a
    // streamable body (older browsers, or no progress requested).
    const totalHeader = res.headers.get("content-length");
    const total = totalHeader ? parseInt(totalHeader, 10) : 0;
    if (!onProgress || !res.body) {
      return await res.blob();
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        onProgress(received, total);
      }
    }
    return new Blob(chunks as BlobPart[], {
      type: res.headers.get("content-type") ?? "application/octet-stream",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `Download timed out after ${FETCH_TIMEOUT_MS / 1000}s. Check your connection and retry.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function downloadCrossOrigin(
  url: string,
  filename?: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const blob = await fetchAsBlob(url, onProgress);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename ?? defaultName(url);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Lifting the revoke window to 30s — at 1s the URL could revoke
  // while the browser is still preparing the save dialog on a
  // large file. Blob URL lifetime cost is tiny.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

// Load an image element from a cross-origin URL via a same-origin
// blob so canvas operations don't taint. Returns the loaded <img>
// element. Throws on fetch / decode failure.
export async function loadImageViaBlob(
  url: string,
  onProgress?: ProgressCallback,
): Promise<HTMLImageElement> {
  const blob = await fetchAsBlob(url, onProgress);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image decode failed"));
      el.src = objectUrl;
    });
    return img;
  } finally {
    // The image element keeps the bitmap; revoking the URL doesn't
    // affect the already-decoded image data.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
}

function defaultName(url: string): string {
  const noQuery = url.split("?")[0];
  const slash = noQuery.lastIndexOf("/");
  return slash >= 0 ? noQuery.slice(slash + 1) : "image";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
