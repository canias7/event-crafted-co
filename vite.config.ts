import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { imagetools } from "vite-imagetools";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // vite-imagetools: lets us write `import x from './foo.jpg?w=800;1600&format=avif;webp;jpg&as=picture'`
    // and get back a <picture>-ready object with srcset + format fallbacks
    // generated at build time. Cuts hero JPEG payload by ~60% with AVIF.
    imagetools({
      defaultDirectives: (url) => {
        // Auto-pictureify images in three asset families:
        //   /assets/hero/*       — landing slideshow + featured imagery
        //   /assets/vendora-*    — feature shots used on landing + press kit
        //   /assets/vendor-*     — category fallback images on cards
        // Each gets AVIF + WebP + JPG variants at 640/1024/1600 widths.
        if (
          /\/assets\/hero\//.test(url.pathname) ||
          /\/assets\/vendora-/.test(url.pathname) ||
          /\/assets\/vendor-/.test(url.pathname)
        ) {
          return new URLSearchParams({
            format: "avif;webp;jpg",
            w: "640;1024;1600",
            as: "picture",
            quality: "72",
          });
        }
        return new URLSearchParams();
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Bump the warn threshold so the existing chunks (still all under
    // ~250kB gzipped) don't trip a yellow warning every build.
    chunkSizeWarningLimit: 800,
    // Note: tried `rollupOptions.output.manualChunks` to split leaflet /
    // motion / radix / react-core into named cache lanes, but it kept
    // creating circular cross-chunk imports — react-using packages
    // would call React.forwardRef / createContext during module
    // initialization while React's exports weren't ready. Vite's
    // default chunking handles the import graph correctly; the
    // resulting chunks are slightly larger but everything works.
  },
}));
