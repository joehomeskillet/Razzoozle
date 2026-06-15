import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Vitest config for the socket package. The repo resolves the workspace
// packages via path aliases (the `@razzoozle/common` package has no `exports`
// field — subpaths like `@razzoozle/common/constants` map straight to the raw
// TypeScript sources under `../common/src`). We mirror exactly the alias map
// used by `packages/web/vite.config.ts` so test imports resolve the same way
// the production esbuild/vite builds do, with no extra dependency.
//
// IMPORTANT: this is a TEST-ONLY config. It does not touch the production build
// (esbuild.config.js) and adds no runtime dependency to the shipped bundle.
export default defineConfig({
  resolve: {
    alias: {
      "@razzoozle/common": fileURLToPath(
        new URL("../common/src", import.meta.url),
      ),
      "@razzoozle/socket": fileURLToPath(new URL("./src", import.meta.url)),
      "@razzoozle/web": fileURLToPath(new URL("../web/src", import.meta.url)),
    },
  },
  test: {
    // Node environment: the socket package is pure server code (socket.io,
    // timers) — no DOM needed.
    environment: "node",
    // `globals: true` exposes describe/it/expect/vi without imports, matching
    // the project's lean style.
    globals: true,
    // Only our co-located tests under src/**/__tests__; never pull in the
    // unrelated top-level satellite test or node_modules.
    include: ["src/**/__tests__/**/*.test.ts"],
    // The multi-client integration test binds a real ephemeral port; give the
    // whole suite a sane ceiling so a flaky socket bind fails fast instead of
    // hanging CI.
    testTimeout: 10000,
    hookTimeout: 10000,
  },
})
