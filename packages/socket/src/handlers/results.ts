import { EVENTS } from "@razzoozle/common/constants"
import type { SharedResult } from "@razzoozle/common/types/game"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { deleteResult, getResultById } from "@razzoozle/socket/services/config"
import manager, { emitConfig } from "@razzoozle/socket/services/manager"

export const resultsSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.RESULTS.GET,
    manager.withAuth(socket, (id) => {
      try {
        socket.emit(EVENTS.RESULTS.DATA, getResultById(id))
      } catch (error) {
        console.error("Failed to get result:", error)
      }
    }),
  )

  socket.on(
    EVENTS.RESULTS.DELETE,
    manager.withAuth(socket, (id) => {
      try {
        deleteResult(id)
        emitConfig(socket)
      } catch (error) {
        console.error("Failed to delete result:", error)
      }
    }),
  )

  // PUBLIC (no auth): a shareable post-event leaderboard. Strips `questions`
  // so a public link never leaks per-question answers/solutions (anti-cheat).
  socket.on(EVENTS.RESULTS.GET_SHARED, (id) => {
    try {
      const result = getResultById(id)
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
