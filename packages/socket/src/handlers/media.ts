import { EVENTS } from "@razzoozle/common/constants"
import {
  mediaDeleteValidator,
  mediaUploadValidator,
} from "@razzoozle/common/validators/media"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  deleteMediaFile,
  saveMediaFile,
} from "@razzoozle/socket/services/config"
import { readMediaList } from "@razzoozle/socket/services/storage/config-read"
import manager from "@razzoozle/socket/services/manager"

// Media manager. ALL events are auth-gated (manager only). LIST emits the
// manifest. Mutations re-emit DATA so all manager clients can refresh from one
// source of truth.
export const mediaSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.MEDIA.LIST,
    manager.withAuth(socket, async () => {
      socket.emit(EVENTS.MEDIA.DATA, await readMediaList())
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
          socket.emit(EVENTS.MEDIA.DATA, await readMediaList())
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
      void (async () => {
        const result = mediaDeleteValidator.safeParse(payload)

        if (!result.success) {
          socket.emit(EVENTS.MEDIA.ERROR, result.error.issues[0].message)

          return
        }

        try {
          await deleteMediaFile(result.data.id)
          socket.emit(EVENTS.MEDIA.DATA, await readMediaList())
        } catch (error) {
          socket.emit(
            EVENTS.MEDIA.ERROR,
            error instanceof Error ? error.message : "errors:media.notFound",
          )
        }
      })()
    }),
  )
}
