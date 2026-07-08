import { EVENTS } from "@razzoozle/common/constants"
import {
  catalogAddValidator,
  catalogUpdateValidator,
} from "@razzoozle/common/validators/catalog"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  deleteCatalogEntry,
  saveCatalogEntry,
  updateCatalogEntry,
} from "@razzoozle/socket/services/config"
import { readCatalog } from "@razzoozle/socket/services/storage/config-read"
import manager from "@razzoozle/socket/services/manager"
import { z } from "zod"

// Reusable question bank. ALL events are auth-gated (manager only). LIST emits
// the full CatalogEntry[] (the picker needs the whole question to insert it);
// every mutation re-emits the fresh list so connected admins stay in sync.
export const catalogSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.CATALOG.LIST,
    manager.withAuth(socket, async () => {
      socket.emit(EVENTS.CATALOG.DATA, await readCatalog())
    }),
  )

  socket.on(
    EVENTS.CATALOG.ADD,
    manager.withAuth(socket, async (payload: unknown) => {
      const result = catalogAddValidator.safeParse(payload)

      if (!result.success) {
        socket.emit(EVENTS.CATALOG.ERROR, result.error.issues[0].message)

        return
      }

      try {
        saveCatalogEntry(result.data)
        socket.emit(EVENTS.CATALOG.ADD_SUCCESS)
        socket.emit(EVENTS.CATALOG.DATA, await readCatalog())
      } catch (error) {
        socket.emit(
          EVENTS.CATALOG.ERROR,
          error instanceof Error ? error.message : "errors:catalog.saveFailed",
        )
      }
    }),
  )

  socket.on(
    EVENTS.CATALOG.UPDATE,
    manager.withAuth(socket, async (payload: unknown) => {
      const result = catalogUpdateValidator.safeParse(payload)

      if (!result.success) {
        socket.emit(EVENTS.CATALOG.ERROR, result.error.issues[0].message)

        return
      }

      try {
        updateCatalogEntry(result.data.id, {
          question: result.data.question,
          tags: result.data.tags,
        })
        socket.emit(EVENTS.CATALOG.ADD_SUCCESS)
        socket.emit(EVENTS.CATALOG.DATA, await readCatalog())
      } catch (error) {
        socket.emit(
          EVENTS.CATALOG.ERROR,
          error instanceof Error ? error.message : "errors:catalog.saveFailed",
        )
      }
    }),
  )

  socket.on(
    EVENTS.CATALOG.DELETE,
    manager.withAuth(socket, async (payload: unknown) => {
      const result = z.object({ id: z.string() }).safeParse(payload)

      if (!result.success) {
        socket.emit(EVENTS.CATALOG.ERROR, result.error.issues[0].message)

        return
      }

      try {
        deleteCatalogEntry(result.data.id)
        socket.emit(EVENTS.CATALOG.DATA, await readCatalog())
      } catch (error) {
        socket.emit(
          EVENTS.CATALOG.ERROR,
          error instanceof Error ? error.message : "errors:catalog.notFound",
        )
      }
    }),
  )
}
