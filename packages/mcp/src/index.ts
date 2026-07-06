#!/usr/bin/env node
// Project-scoped MCP stdio server for the Rahoot/Razzia quiz app.
//
// Two tool groups:
//   1. AUTHORING — read/write quizz/result/submission/theme files in the live
//      config volume (RAHOOT_CONFIG), validated with @razzoozle/common validators
//      before every write, plus AI image generation via ComfyUI into config/media.
//   2. GAME CONTROL — drive a LIVE game as a manager over socket.io-client
//      (RAHOOT_SOCKET_URL, path /ws), reusing @razzoozle/common EVENTS. The
//      presenter/beamer (a socket client reflecting game state) stays paired to
//      whatever game start_game creates.
//
// Secrets: the manager password is read from game.json only inside the game
// controller and is NEVER echoed to a tool result, a log, or the server stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { getConfigDir } from "./config-store.js"
import { registerQuizTools } from "./tools/quizzes.js"
import { registerResultTools } from "./tools/results.js"
import { registerSubmissionTools } from "./tools/submissions.js"
import { registerConfigTools } from "./tools/config.js"
import { registerCatalogTools } from "./tools/catalog.js"
import { registerAiTools } from "./tools/ai.js"
import { registerGameTools } from "./tools/game.js"

const server = new McpServer({
  name: "rahoot-mcp",
  version: "1.0.0",
})

// Register every tool group against the shared server. Registration order is
// behaviorally irrelevant — tools are keyed by name.
registerQuizTools(server)
registerResultTools(server)
registerSubmissionTools(server)
registerConfigTools(server)
registerCatalogTools(server)
registerAiTools(server)
registerGameTools(server)

// ── boot ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr only (stdout is the MCP JSON-RPC channel — never write to it).
  process.stderr.write(
    `[rahoot-mcp] ready. config=${getConfigDir()} socket=${
      process.env.RAHOOT_SOCKET_URL ?? "http://127.0.0.1:3010"
    }\n`,
  )
}

main().catch((e) => {
  process.stderr.write(
    `[rahoot-mcp] fatal: ${e instanceof Error ? e.message : String(e)}\n`,
  )
  process.exit(1)
})
