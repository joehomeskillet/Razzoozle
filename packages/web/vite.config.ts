import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "url"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { version } from "../../package.json"

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    tanstackRouter({
      target: "react",
      routeToken: "layout",
      routesDirectory: "./src/pages",
      generatedRouteTree: "./src/route.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Südhang Quiz",
        short_name: "Quiz",
        description: "Live quiz",
        theme_color: "#ff9900",
        background_color: "#1a140b",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // PRECACHE THE SHELL — do NOT precache mp3 (the sounds dir is large;
        // runtime-cache it instead).
        globPatterns: ["**/*.{js,css,html,woff2,woff,svg,png,webp}"],
        navigateFallback: "/index.html",
        // CRITICAL: never intercept the websocket (/ws), socket.io, or the
        // runtime theme.
        navigateFallbackDenylist: [/^\/ws/, /^\/socket/, /^\/theme/],
        runtimeCaching: [
          {
            urlPattern: /\/sounds\/.*\.mp3$/,
            handler: "CacheFirst",
            options: {
              cacheName: "sounds",
              expiration: { maxEntries: 20 },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 3000000,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@razzia/web": fileURLToPath(new URL("./src", import.meta.url)),
      "@razzia/common": fileURLToPath(
        new URL("../common/src", import.meta.url),
      ),
      "@razzia/socket": fileURLToPath(
        new URL("../socket/src", import.meta.url),
      ),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      "/ws": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Split heavy vendor libs into their own chunks for better caching
        // and parallel loading instead of one monolithic app bundle.
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined
          }
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react"
          }
          if (id.includes("/@radix-ui/")) {
            return "vendor-radix"
          }
          if (id.includes("/framer-motion/") || id.includes("/motion/")) {
            return "vendor-motion"
          }
          if (
            id.includes("/socket.io-client/") ||
            id.includes("/engine.io-client/") ||
            id.includes("/engine.io-parser/")
          ) {
            return "vendor-socket"
          }
          if (id.includes("/@tanstack/")) {
            return "vendor-router"
          }
          if (id.includes("/@hello-pangea/dnd/")) {
            return "vendor-dnd"
          }
          if (id.includes("/i18next/") || id.includes("/react-i18next/")) {
            return "vendor-i18n"
          }
          return "vendor"
        },
      },
    },
  },
})
