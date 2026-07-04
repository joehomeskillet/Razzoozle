import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Vitest config for the common package. Mirrors the alias map used by other
// packages so test imports resolve the same way the production builds do.
export default defineConfig({
  resolve: {
    alias: {
      "@razzoozle/common": fileURLToPath(
        new URL("./src", import.meta.url),
      ),
      "@razzoozle/socket": fileURLToPath(
        new URL("../socket/src", import.meta.url),
      ),
      "@razzoozle/web": fileURLToPath(
        new URL("../web/src", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
})
