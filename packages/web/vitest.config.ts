import { fileURLToPath } from "url"
import { defineConfig } from "vitest/config"

// Minimal web test runner. Mirrors vite.config.ts's workspace aliases without
// pulling in the React/Router/PWA build plugins (not needed for unit tests).
// Pure-TS units run under the default node env; a jsdom env + Testing Library
// can be layered on later for component tests (backlog: web component tests).
export default defineConfig({
  resolve: {
    alias: {
      "@razzoozle/web": fileURLToPath(new URL("./src", import.meta.url)),
      "@razzoozle/common": fileURLToPath(
        new URL("../common/src", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
