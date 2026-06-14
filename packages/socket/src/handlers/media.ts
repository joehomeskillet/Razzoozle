import { EVENTS } from "@razzia/common/constants"
import {
  mediaDeleteValidator,
  mediaUploadValidator,
} from "@razzia/common/validators/media"
import type { SocketContext } from "@razzia/socket/handlers/types"
import {
  deleteMediaFile,
  getMediaList,
  saveMediaFile,
} from "@razzia/socket/services/config"
import manager from "@razzia/socket/services/manager"

// Media manager. ALL events are auth-gated (manager only). LIST emits the
// manifest. Mutations re-emit DATA so all manager clients can refresh from one
// source of truth.
export const mediaSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.MEDIA.LIST,
    manager.withAuth(socket, () => {
      socket.emit(EVENTS.MEDIA.DATA, getMediaList())
    }),
  )

  socket.on(
    EVENTS.MEDIA.UPLOAD,
    manager.withAuth(socket, (payload: unknown) => {
      void (async () => {
        const result = mediaUploadValidator.safeParse(payload)

        if (!result.success) {
          socket.emit(EVENTS.MEDIA.ERROR, result.error.issues[0].message)

          return
        }

        try {
          await saveMediaFile(
            result.data.dataUrl,
            result.data.filename,
            result.data.category,
          )
          socket.emit(EVENTS.MEDIA.UPLOAD_SUCCESS)
          socket.emit(EVENTS.MEDIA.DATA, getMediaList())
        } catch (error) {
          socket.emit(
            EVENTS.MEDIA.ERROR,
            error instanceof Error ? error.message : "errors:media.saveFailed",
          )
        }
      })()
    }),
  )

  socket.on(
    EVENTS.MEDIA.DELETE,
    manager.withAuth(socket, (payload: unknown) => {
      const result = mediaDeleteValidator.safeParse(payload)

      if (!result.success) {
        socket.emit(EVENTS.MEDIA.ERROR, result.error.issues[0].message)

        return
      }

      try {
        deleteMediaFile(result.data.id)
        socket.emit(EVENTS.MEDIA.DATA, getMediaList())
      } catch (error) {
        socket.emit(
          EVENTS.MEDIA.ERROR,
          error instanceof Error ? error.message : "errors:media.notFound",
        )
      }
    }),
  )
}
