import { useEffect } from "react";

interface DocumentMeta {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  // Open Graph type — "website" for landing pages, "article" for editorial,
  // "product" for vendors. Default "website".
  type?: "website" | "article" | "product";
}

const FALLBACK_TITLE =
  "Vendora — Premium Event Planning & Vendor Marketplace";
const FALLBACK_DESCRIPTION =
  "Discover trusted vendors, book appointments, manage your event checklist, create stunning invitations, and pay securely — all in one beautiful platform.";
// Static branded OG image at /public/og.jpg — used when a page doesn't
// pass its own image. Must be an absolute path so social crawlers can
// fetch it.
const FALLBACK_OG_IMAGE =
  typeof window !== "undefined"
    ? `${window.location.origin}/og.jpg`
    : "/og.jpg";

function setMetaByName(name: string, content: string) {
  let el = document.querySelector(
    `meta[name="${name}"]`,
  ) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property: string, content: string) {
  let el = document.querySelector(
    `meta[property="${property}"]`,
  ) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.querySelector(
    'link[rel="canonical"]',
  ) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Sets the page title + Open Graph + Twitter card meta tags. On unmount,
 * resets to the Vendora defaults from index.html so navigating between
 * pages doesn't leak stale state.
 *
 * Important caveat: this runs in JS, so social-platform crawlers that
 * don't execute JS (Twitter, Facebook bots) will only see whatever was
 * in the static index.html shell. Google does run JS and will pick these
 * up. Full social-share unfurls require SSR / prerendering — track that
 * as a separate hosting concern.
 */
export function useDocumentMeta(meta: DocumentMeta) {
  useEffect(() => {
    const title = meta.title;
    const description = meta.description ?? FALLBACK_DESCRIPTION;
    // Always set an OG image — fall back to the branded /og.jpg when
    // the page didn't set one. Social-share unfurls without an image
    // look orphaned.
    const image = meta.image ?? FALLBACK_OG_IMAGE;
    const url =
      meta.url ??
      (typeof window !== "undefined" ? window.location.href : undefined);
    const type = meta.type ?? "website";

    document.title = title;
    setMetaByName("description", description);

    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", description);
    setMetaByProperty("og:type", type);
    if (url) setMetaByProperty("og:url", url);
    setMetaByProperty("og:image", image);

    setMetaByName("twitter:card", "summary_large_image");
    setMetaByName("twitter:title", title);
    setMetaByName("twitter:description", description);
    setMetaByName("twitter:image", image);

    if (url) setCanonical(url);

    return () => {
      // Restore defaults so the next page doesn't accidentally inherit.
      document.title = FALLBACK_TITLE;
      setMetaByName("description", FALLBACK_DESCRIPTION);
      setMetaByProperty("og:title", FALLBACK_TITLE);
      setMetaByProperty("og:description", FALLBACK_DESCRIPTION);
      setMetaByProperty("og:type", "website");
    };
  }, [meta.title, meta.description, meta.image, meta.url, meta.type]);
}
