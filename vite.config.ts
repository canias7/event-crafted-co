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
    rollupOptions: {
      output: {
        // Split heavy third-party deps out of the main chunk so that
        // landing-page visitors don't download leaflet / framer-motion /
        // radix until they actually navigate to a route that needs them.
        // Keep groupings broad — over-fragmentation hurts HTTP/2 less
        // than over-bundling, but each chunk has its own request cost.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          // Order matters — most-specific first.
          if (id.includes("leaflet") || id.includes("react-leaflet")) {
            return "leaflet";
          }
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("date-fns")) return "date-fns";
          // Pull react-core out of the catch-all vendor chunk so it can
          // cache independently across deploys (most app changes don't
          // bump react). React-router rides along since it changes at
          // a similar cadence.
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/") ||
            id.includes("react-router")
          ) {
            return "react-core";
          }
          // i18next + locales don't change often; separate cache lane.
          if (id.includes("i18next") || id.includes("i18n")) return "i18n";
          // @tanstack/react-query lives in its own lane too.
          if (id.includes("@tanstack")) return "tanstack";
          // Everything else stays in the main vendor chunk.
          return "vendor";
        },
      },
    },
    // Bump the warn threshold so the existing chunks (still all under
    // ~250kB gzipped) don't trip a yellow warning every build.
    chunkSizeWarningLimit: 800,
  },
}));
