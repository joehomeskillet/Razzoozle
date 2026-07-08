import { EVENTS } from "@razzoozle/common/constants"
import type { SharedResult } from "@razzoozle/common/types/game"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { deleteResult } from "@razzoozle/socket/services/config"
import { readResultById } from "@razzoozle/socket/services/storage/config-read"
import manager, { emitConfig } from "@razzoozle/socket/services/manager"

export const resultsSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.RESULTS.GET,
    manager.withAuth(socket, async (id) => {
      try {
        socket.emit(EVENTS.RESULTS.DATA, await readResultById(id))
      } catch (error) {
        // Unlike GET_SHARED (public, intentionally silent with a client-side
        // timeout fallback), this is the manager's authenticated "open result"
        // click — it needs its own feedback so a missing/corrupt result
        // doesn't leave the console stuck with no explanation.
        console.error("Failed to get result:", error)
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:manager.resultNotFound",
        )
      }
    }),
  )

  socket.on(
    EVENTS.RESULTS.DELETE,
    manager.withAuth(socket, async (id) => {
      try {
        deleteResult(id)
        await emitConfig(socket)
      } catch (error) {
        // The client shows an unconditional success toast on DELETE, so a
        // failure here needs its own error emit; re-emitting the config also
        // refreshes the results list so the manager sees the result is still
        // there rather than trusting the stale optimistic removal.
        console.error("Failed to delete result:", error)
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:manager.resultDeleteFailed",
        )
        await emitConfig(socket)
      }
    }),
  )

  // PUBLIC (no auth): a shareable post-event leaderboard. Strips `questions`
  // so a public link never leaks per-question answers/solutions (anti-cheat).
  socket.on(EVENTS.RESULTS.GET_SHARED, async (id) => {
    try {
      const result = await readResultById(id)
      const shared: SharedResult = {
        id: result.id,
        subject: result.subject,
        date: result.date,
        players: result.players,
        // Replay the post-game recap (superlatives) on the share page when the
        // stored result carries it. Winner names here are already shown publicly
        // by the share page's ranking — consistent, no extra leak. Omitted when
        // the result predates recap persistence.
        ...(result.recap ? { recap: result.recap } : {}),
      }
      socket.emit(EVENTS.RESULTS.SHARED_DATA, shared)
    } catch (error) {
      // Unknown/invalid id: stay silent. The client shows a friendly
      // "not found" state after a short timeout; we never emit quiz content.
      console.error("Failed to get shared result:", error)
    }
  })
}
