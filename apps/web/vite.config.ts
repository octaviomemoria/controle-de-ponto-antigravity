import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["brand/icon-official-192.png", "brand/icon-official-512.png"],
      manifest: {
        name: "Controle de Ponto OM Way",
        short_name: "Ponto OM",
        description: "Controle de ponto e produtividade",
        theme_color: "#2563eb",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        id: "com.omway.controleponto",
        icons: [
          {
            src: "brand/icon-official-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "brand/icon-official-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "brand/icon-official-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      }
    })
  ],
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React stack — always needed, cache aggressively
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router-dom/") ||
            id.includes("node_modules/react-router/") ||
            id.includes("node_modules/@remix-run/")
          ) {
            return "vendor-react";
          }

          // Supabase client — large, changes independently
          if (id.includes("node_modules/@supabase/")) {
            return "vendor-supabase";
          }

          // Heavy export libs loaded lazily in code already;
          // bundling them in a named chunk lets the browser cache them
          if (
            id.includes("node_modules/jspdf") ||
            id.includes("node_modules/jspdf-autotable") ||
            id.includes("node_modules/xlsx")
          ) {
            return "vendor-export";
          }
        }
      }
    }
  }
});
