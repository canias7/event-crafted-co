// 360° equirectangular panorama viewer. Wraps Pannellum, which is
// self-hosted from /public/pannellum and lazy-loaded on first use
// (no npm dependency — npm installs can't run in this environment).
// Pass an equirectangular image URL (or object URL) as `src`.

import { useEffect, useRef, useState } from "react";

type PannellumViewer = { destroy: () => void };
type PannellumGlobal = {
  viewer: (el: HTMLElement, cfg: Record<string, unknown>) => PannellumViewer;
};

let loadPromise: Promise<void> | null = null;

// Inject Pannellum's CSS + JS once, resolve when the global is ready.
function loadPannellum(): Promise<void> {
  if ((window as unknown as { pannellum?: PannellumGlobal }).pannellum) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    if (!document.querySelector("link[data-pannellum]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/pannellum/pannellum.css";
      link.setAttribute("data-pannellum", "");
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "/pannellum/pannellum.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("pannellum_load_failed"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function Panorama360({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const destroy = () => {
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch {
          /* viewer already gone */
        }
        viewerRef.current = null;
      }
    };
    loadPannellum()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const pannellum = (window as unknown as { pannellum?: PannellumGlobal })
          .pannellum;
        if (!pannellum) {
          setStatus("error");
          return;
        }
        destroy();
        viewerRef.current = pannellum.viewer(containerRef.current, {
          type: "equirectangular",
          panorama: src,
          autoLoad: true,
          autoRotate: -2,
          showControls: true,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      destroy();
    };
  }, [src]);

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden bg-black"
      style={{ aspectRatio: "16 / 9" }}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
          Couldn't load the 360° viewer.
        </div>
      ) : null}
    </div>
  );
}
