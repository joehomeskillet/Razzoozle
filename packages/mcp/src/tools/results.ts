// GROUP 1 — AUTHORING: past game results (read-only).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { getResultById, getResultsMeta } from "../config-store.js"
import { fail, ok } from "./shared.js"

export function registerResultTools(server: McpServer): void {
  server.registerTool(
    "list_results",
    {
      title: "List past game results",
      description: "List saved game results (id, subject, date, playerCount).",
      inputSchema: {},
    },
    () => {
      try {
        return ok(getResultsMeta())
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "get_result",
    {
      title: "Get a game result",
      description:
        "Get a full saved game result (players + per-question answers) by id.",
      inputSchema: { id: z.string().describe("Result id (from list_results).") },
    },
    ({ id }: { id: string }) => {
      try {
        return ok(getResultById(id))
      } catch (e) {
        return fail(e)
      }
    },
  )
}
