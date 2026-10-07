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
    // vite-imagetools: lets us write `import x from './foo.webp?w=800;1122&format=webp;jpg&as=picture'`
    // and get back a <picture>-ready object with srcset + format fallbacks
    // generated at build time.
    imagetools({
      defaultDirectives: (url) => {
        // Auto-pictureify the site's photos, /assets/photos/NN.webp: the
        // owner's pictures, numbered as in the "Photos" tab of the page
        // walkthrough doc. Each gets WebP + JPG variants at 480/800 and its
        // full 1122px width (imagetools never upscales). No AVIF: for these
        // pictures it came out ~40% larger than WebP at the same quality,
        // and it's the slowest step of the build.
        if (/\/assets\/photos\//.test(url.pathname)) {
          return new URLSearchParams({
            format: "webp;jpg",
            w: "480;800;1122",
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
