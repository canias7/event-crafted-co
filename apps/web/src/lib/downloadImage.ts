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

export async function downloadCrossOrigin(
  url: string,
  filename?: string,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Couldn't fetch image (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename ?? defaultName(url);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

// Load an image element from a cross-origin URL via a same-origin
// blob so canvas operations don't taint. Returns the loaded <img>
// element. Throws on fetch / decode failure.
export async function loadImageViaBlob(url: string): Promise<HTMLImageElement> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Couldn't fetch image (${res.status})`);
  }
  const blob = await res.blob();
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
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

function defaultName(url: string): string {
  const noQuery = url.split("?")[0];
  const slash = noQuery.lastIndexOf("/");
  return slash >= 0 ? noQuery.slice(slash + 1) : "image";
}
