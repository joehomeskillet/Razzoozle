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
        name: "Razzoozle Quiz",
        short_name: "Razzoozle",
        description: "Live quiz",
        theme_color: "#7c3aed",
        background_color: "#F4F1EA",
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
        // Precache the hashed (immutable) assets, but NOT index.html: serve the
        // HTML shell NetworkFirst so a deploy is picked up on the next reload
        // (no double-reload). This app needs the websocket to function, so an
        // online-first shell is the right tradeoff (offline play is impossible
        // anyway); the runtime cache still covers a brief static-side blip.
        globPatterns: ["**/*.{js,css,woff2,woff,svg,png,webp}"],
        // The @dicebear avatar-gen chunk is large but loaded lazily on demand (only
        // when the avatar UI mounts), so it must NOT be precached — otherwise that
        // 3MB chunk blows the SW precache limit and fails the build. Exclude it; it
        // is fetched at runtime when first needed.
        globIgnores: ["**/dicebear-*.js"],
        // vite-plugin-pwa defaults navigateFallback to "index.html", which would
        // auto-register a cache-first NavigationRoute *before* (and thus shadow)
        // our NetworkFirst navigate route below. Null it out so the only handler
        // for navigations is the NetworkFirst route — that's the whole point.
        navigateFallback: null,
        runtimeCaching: [
          {
            // request.mode === "navigate" matches only top-level page loads — it
            // never matches /ws (websocket), socket.io XHR, /theme, or asset fetches.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-shell",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 16 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/sounds\/.*\.mp3$/,
            handler: "CacheFirst",
            options: { cacheName: "sounds", expiration: { maxEntries: 20 } },
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
      "@razzoozle/web": fileURLToPath(new URL("./src", import.meta.url)),
      "@razzoozle/common": fileURLToPath(
        new URL("../common/src", import.meta.url),
      ),
      "@razzoozle/socket": fileURLToPath(
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
      "/api": {
        target: "http://localhost:3001",
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
          if (
            id.includes("/react-markdown/") ||
            id.includes("/remark-gfm/") ||
            id.includes("/remark-") ||
            id.includes("/micromark") ||
            id.includes("/mdast-util-") ||
            id.includes("/hast-util-") ||
            id.includes("/unist-util-") ||
            id.includes("/unified/") ||
            id.includes("/vfile") ||
            id.includes("/property-information/") ||
            id.includes("/html-url-attributes/") ||
            id.includes("/comma-separated-tokens/") ||
            id.includes("/space-separated-tokens/") ||
            id.includes("/decode-named-character-reference/") ||
            id.includes("/character-entities") ||
            id.includes("/markdown-table/") ||
            id.includes("/longest-streak/") ||
            id.includes("/zwitch/") ||
            id.includes("/trough/") ||
            id.includes("/bail/") ||
            id.includes("/ccount/") ||
            id.includes("/devlop/")
          ) {
            return "vendor-markdown"
          }
          // canvas-confetti + react-confetti (and react-confetti's tween-functions
          // dep) are only used during celebrations and are dynamic-imported at
          // their call sites (utils/confetti.ts, Podium/SharePage React.lazy), so
          // route them to their OWN chunk — kept out of the eager bundle and
          // fetched on demand when a burst first fires.
          if (
            id.includes("/canvas-confetti/") ||
            id.includes("/react-confetti/") ||
            id.includes("/tween-functions/")
          ) {
            return "confetti"
          }
          // @dicebear/core + collection are heavy (~3MB) and dynamically imported
          // (see features/game/utils/dicebear.ts), so route them to their OWN chunk
          // — kept out of the eager "vendor" bundle and loaded lazily on demand.
          if (id.includes("/@dicebear/")) {
            return "dicebear"
          }
          return "vendor"
        },
      },
    },
  },
})
