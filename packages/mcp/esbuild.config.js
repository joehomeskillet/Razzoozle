// Bundle the MCP stdio server into a single self-contained CJS file, mirroring
// packages/socket's build. `@razzia/common` subpaths (`@razzia/common/constants`
// etc.) resolve via the root tsconfig `paths` map, which esbuild reads from the
// nearest tsconfig.json. Bundling inlines @razzia/common + socket.io-client +
// the MCP SDK so `node dist/index.cjs` runs with zero path-resolution concerns —
// exactly the property we want for a stdio MCP server registered via `.mcp.json`.
import esbuild from "esbuild"

export const config = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  // Keep the bundle readable for ops debugging (the socket build minifies; an
  // MCP server is launched per-session and never on a hot path, so favour
  // legibility of stack traces over a few KB).
  minify: false,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "dist/index.cjs",
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
}

void esbuild.build(config)
