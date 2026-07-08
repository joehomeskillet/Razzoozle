import { EVENTS } from "@razzoozle/common/constants"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  assertSafeId,
  deleteQuizz,
  saveQuizz,
  setQuizzArchived,
  updateQuizz,
} from "@razzoozle/socket/services/config"
import { readQuizzById } from "@razzoozle/socket/services/storage/config-read"
import manager, { emitConfig } from "@razzoozle/socket/services/manager"
import { z } from "zod"

export const quizzSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.QUIZZ.GET,
    manager.withAuth(socket, async (id) => {
      try {
        const quizz = await readQuizzById(id)

        socket.emit(EVENTS.QUIZZ.DATA, quizz)
      } catch (error) {
        console.error("Failed to get quizz:", error)
        socket.emit(EVENTS.QUIZZ.ERROR, "errors:quizz.notFound")
      }
    }),
  )

  socket.on(
    EVENTS.QUIZZ.SAVE,
    manager.withAuth(socket, async (data) => {
      try {
        const { id } = saveQuizz(data)

        socket.emit(EVENTS.QUIZZ.SAVE_SUCCESS, { id })
        await emitConfig(socket)
      } catch (error) {
        console.error("Failed to save quizz:", error)
        const message =
          error instanceof Error ? error.message : "errors:quizz.failedToSave"
        socket.emit(EVENTS.QUIZZ.ERROR, message)
      }
    }),
  )

  socket.on(
    EVENTS.QUIZZ.DELETE,
    manager.withAuth(socket, async (id) => {
      try {
        deleteQuizz(id)

        await emitConfig(socket)
      } catch (error) {
        console.error("Failed to delete quizz:", error)
        socket.emit(EVENTS.QUIZZ.ERROR, "errors:quizz.failedToDelete")
      }
    }),
  )

  socket.on(
    EVENTS.QUIZZ.DUPLICATE,
    manager.withAuth(socket, async (id) => {
      try {
        // Read the source quizz, drop its id, and re-save with a suffixed
        // subject. saveQuizz derives a fresh id from the new subject via
        // normalizeFilename, so the original is left untouched.
        const { id: _sourceId, subject, ...rest } = await readQuizzById(id)

        saveQuizz({ ...rest, subject: `${subject} (Kopie)` })

        await emitConfig(socket)
      } catch (error) {
        console.error("Failed to duplicate quizz:", error)
        socket.emit(EVENTS.QUIZZ.ERROR, "errors:quizz.failedToSave")
      }
    }),
  )

  socket.on(
    EVENTS.QUIZZ.UPDATE,
    manager.withAuth(socket, async ({ id, ...data }) => {
      try {
        const { id: newId } = updateQuizz(id, data)

        socket.emit(EVENTS.QUIZZ.UPDATE_SUCCESS, { id: newId })
        await emitConfig(socket)
      } catch (error) {
        console.error("Failed to update quizz:", error)
        const message =
          error instanceof Error ? error.message : "errors:quizz.failedToUpdate"
        socket.emit(EVENTS.QUIZZ.ERROR, message)
      }
    }),
  )

  // Archive toggle: hides a quizz from the play list without deleting it.
  socket.on(
    EVENTS.QUIZZ.SET_ARCHIVED,
    manager.withAuth(socket, async (payload: unknown) => {
      const result = z
        .object({ id: z.string(), archived: z.boolean() })
        .safeParse(payload)

      if (!result.success) {
        socket.emit(EVENTS.QUIZZ.ERROR, result.error.issues[0].message)

        return
      }

      try {
        assertSafeId(result.data.id)
        setQuizzArchived(result.data.id, result.data.archived)
        await emitConfig(socket)
      } catch (error) {
        console.error("Failed to set quizz archived:", error)
        socket.emit(
          EVENTS.QUIZZ.ERROR,
          error instanceof Error ? error.message : "errors:quizz.notFound",
        )
      }
    }),
  )
}
