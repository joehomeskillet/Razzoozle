// GROUP 2 — GAME CONTROL (live socket, game master).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { gameController } from "../game-controller.js"
import { fail, ok } from "./shared.js"

export function registerGameTools(server: McpServer): void {
  server.registerTool(
    "start_game",
    {
      title: "Start a live game (host)",
      description:
        "Connect to the live socket as manager, authenticate (password read from game.json — never shown), create a game for `quizId`, and return the join PIN + gameId. The presenter/beamer paired to this game then reflects its state. After this, call begin_round to leave the lobby and show question 1.",
      inputSchema: {
        quizId: z.string().describe("Quiz id to host (from list_quizzes)."),
      },
    },
    async ({ quizId }: { quizId: string }) => {
      try {
        const { gameId, pin } = await gameController.startGame(quizId)
        return ok({
          gameId,
          pin,
          joinHint: `Players join with PIN ${pin}. Call begin_round to start question 1.`,
        })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "begin_round",
    {
      title: "Begin the game (start question 1)",
      description:
        "Leave the lobby and start the first round of the current game (emits START_GAME). Players must have joined first. The game then advances via next_question.",
      inputSchema: {},
    },
    () => {
      try {
        gameController.begin()
        return ok({ started: true, state: gameController.getState() })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "next_question",
    {
      title: "Advance to the next question",
      description:
        "Advance the current game to the next question (or from a leaderboard view to the next round). Emits NEXT_QUESTION.",
      inputSchema: {},
    },
    () => {
      try {
        gameController.nextQuestion()
        return ok({ advanced: true })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "show_leaderboard",
    {
      title: "Show the leaderboard",
      description:
        "Show the standings on the presenter (emits SHOW_LEADERBOARD), typically between questions.",
      inputSchema: {},
    },
    () => {
      try {
        gameController.showLeaderboard()
        return ok({ leaderboardShown: true })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "abort_game",
    {
      title: "Abort the current game",
      description:
        "Abort the running quiz (emits ABORT_QUIZ). Players get a reset.",
      inputSchema: {},
    },
    () => {
      try {
        gameController.abort()
        return ok({ aborted: true })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "add_bots",
    {
      title: "Add scripted bot players (sim mode)",
      description:
        "Add N scripted bot opponents to the current game (emits ADD_BOTS). NOTE: the SERVER REFUSES this unless it runs with RAHOOT_SIM_MODE=1; otherwise it replies 'errors:manager.simModeDisabled' (surfaced in get_game_state.lastError). Must be called in the lobby / between answer windows.",
      inputSchema: {
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .describe("How many bots to add (1-50 per request; per-game cap 200)."),
      },
    },
    ({ count }: { count: number }) => {
      try {
        gameController.addBots(count)
        return ok({
          requested: count,
          note: "Refused server-side unless RAHOOT_SIM_MODE=1. Check get_game_state.lastError.",
        })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    "get_game_state",
    {
      title: "Get live game state",
      description:
        "Current game master view: connection/auth, gameId, join PIN, started flag, current phase/status + data, current/total question, player roster + scores, and lastError (e.g. a refused action).",
      inputSchema: {},
    },
    () => {
      try {
        const s = gameController.getState()
        return ok({
          ...s,
          players: s.players.map((p) => ({
            username: p.username,
            points: p.points,
            streak: p.streak,
            connected: p.connected,
            isBot: p.isBot ?? false,
          })),
        })
      } catch (e) {
        return fail(e)
      }
    },
  )

  // Optional, documented-but-not-implemented future capability: browser-level
  // presenter automation. The robust, REQUIRED path is the socket-level game
  // master control above — the presenter/beamer is itself a socket client that
  // reflects the game state this server drives. A `presenter_open`/`presenter_*`
  // browser-automation tool (e.g. via Playwright pointed at /satellite/<gameId>)
  // could be added later, but is intentionally NOT wired here so the server has no
  // heavy browser dependency. See README "Presenter / beamer".
}
