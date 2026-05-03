import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
          if (id.includes("leaflet") || id.includes("react-leaflet")) {
            return "leaflet";
          }
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("date-fns")) return "date-fns";
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
