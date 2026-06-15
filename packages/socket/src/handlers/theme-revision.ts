import { EVENTS } from "@razzoozle/common/constants"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  getThemeRevisionById,
  getThemeRevisions,
  setTheme,
} from "@razzoozle/socket/services/config"
import manager from "@razzoozle/socket/services/manager"
import { z } from "zod"

// Theme revisions (#12 WP-18). Per-save revision ring; ALL events are auth-gated
// (manager only). LIST/DATA carry the full ThemeRevision[] (the picker restores
// without a 2nd fetch, mirroring theme-template). RESTORE re-applies the captured
// theme through setTheme (which itself snapshots the pre-restore state → restore
// is undoable), re-broadcasts MANAGER.THEME to every other client, and re-emits
// the fresh revision list so the picker stays in sync.
export const themeRevisionSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.THEME_REVISION.LIST_REVISIONS,
    manager.withAuth(socket, () => {
      socket.emit(EVENTS.THEME_REVISION.DATA, getThemeRevisions())
    }),
  )

  socket.on(
    EVENTS.THEME_REVISION.RESTORE_REVISION,
    manager.withAuth(socket, (payload: unknown) => {
      const result = z.object({ id: z.string() }).safeParse(payload)

      if (!result.success) {
        socket.emit(
          EVENTS.THEME_REVISION.ERROR,
          result.error.issues[0].message,
        )

        return
      }

      try {
        const revision = getThemeRevisionById(result.data.id)

        if (!revision) {
          socket.emit(
            EVENTS.THEME_REVISION.ERROR,
            "errors:themeRevision.notFound",
          )

          return
        }

        // Snapshot the pre-restore theme so the restore is itself undoable.
        const theme = setTheme(revision.theme, { snapshot: true })

        socket.emit(EVENTS.THEME_REVISION.RESTORE_SUCCESS, theme)
        // Live-update every other connected client.
        socket.broadcast.emit(EVENTS.MANAGER.THEME, theme)
        // The pre-restore state is now a new revision → re-emit the fresh list.
        socket.emit(EVENTS.THEME_REVISION.DATA, getThemeRevisions())
      } catch (error) {
        socket.emit(
          EVENTS.THEME_REVISION.ERROR,
          error instanceof Error
            ? error.message
            : "errors:themeRevision.restoreFailed",
        )
      }
    }),
  )
}
