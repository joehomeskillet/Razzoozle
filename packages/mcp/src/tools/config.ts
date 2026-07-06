// GROUP 1 — AUTHORING: app config overview + theme (live-broadcast on set).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
  getConfigDir,
  getQuizzMeta,
  getResultsMeta,
  getSubmissionsMeta,
  getTheme,
  setTheme,
} from "../config-store.js"
import { gameController } from "../game-controller.js"
import { fail, ok } from "./shared.js"

export function registerConfigTools(server: McpServer): void {
  server.registerTool(
    "get_config",
    {
      title: "Get app config overview",
      description:
        "Non-secret overview: config dir, quiz/result/submission counts, manager-password configured flag (NEVER the password), and the active theme.",
      inputSchema: {},
    },
    () => {
      try {
        // We intentionally do NOT call getGameConfig() here (it would surface the
        // password). Whether auth is usable is reported only as a boolean by
        // attempting a connect-light check would require the socket; instead we
        // report file presence.
        return ok({
          configDir: getConfigDir(),
          quizzes: getQuizzMeta().length,
          results: getResultsMeta().length,
          submissions: getSubmissionsMeta().length,
          theme: getTheme(),
          socketUrl: process.env.RAHOOT_SOCKET_URL ?? "http://127.0.0.1:3010",
          simModeEnabled: process.env.RAHOOT_SIM_MODE === "1",
        })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "get_theme",
    {
      title: "Get theme",
      description:
        "Get the current theme (colors, radius, backgrounds, branding).",
      inputSchema: {},
    },
    () => {
      try {
        return ok(getTheme())
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "set_theme",
    {
      title: "Set theme",
      description:
        "Persist a full theme object (validated with themeValidator) to config/theme/theme.json. If a game is live and authenticated, also live-broadcasts it to every connected client. Provide the WHOLE theme (get_theme first, then modify).",
      inputSchema: {
        theme: z
          .record(z.string(), z.unknown())
          .describe("Full theme object (see get_theme for the shape)."),
        broadcast: z
          .boolean()
          .optional()
          .describe(
            "If true and a game is live, also push to connected clients via the manager socket.",
          ),
      },
    },
    ({ theme, broadcast }: { theme: Record<string, unknown>; broadcast?: boolean }) => {
      try {
        const saved = setTheme(theme)
        let pushed = false
        if (broadcast && gameController.getState().authenticated) {
          gameController.setTheme(saved)
          pushed = true
        }
        return ok({ saved: true, broadcast: pushed, theme: saved })
      } catch (e) {
        return fail(e)
      }
    },
  )
}
