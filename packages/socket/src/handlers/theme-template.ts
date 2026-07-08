import { EVENTS } from "@razzoozle/common/constants"
import { themeTemplateValidator } from "@razzoozle/common/validators/theme"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  deleteThemeTemplate,
  saveThemeTemplate,
} from "@razzoozle/socket/services/config"
import { readThemeTemplates } from "@razzoozle/socket/services/storage/config-read"
import manager, { emitConfig } from "@razzoozle/socket/services/manager"
import { z } from "zod"

// Named theme presets (#28). ALL events are auth-gated (manager only). LIST/DATA
// carry the full ThemeTemplate[] (the picker applies a template without a second
// fetch); every mutation re-emits the fresh list + a config snapshot (which
// carries the lightweight themeTemplates meta) so connected admins stay in sync.
export const themeTemplateSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.THEME_TEMPLATE.LIST,
    manager.withAuth(socket, async () => {
      socket.emit(EVENTS.THEME_TEMPLATE.DATA, await readThemeTemplates())
    }),
  )

  socket.on(
    EVENTS.THEME_TEMPLATE.SAVE,
    manager.withAuth(socket, async (payload: unknown) => {
      const result = themeTemplateValidator.safeParse(payload)

      if (!result.success) {
        socket.emit(EVENTS.THEME_TEMPLATE.ERROR, result.error.issues[0].message)

        return
      }

      try {
        saveThemeTemplate({
          name: result.data.name,
          theme: result.data.theme,
        })
        socket.emit(EVENTS.THEME_TEMPLATE.SAVE_SUCCESS)
        socket.emit(EVENTS.THEME_TEMPLATE.DATA, await readThemeTemplates())
        await emitConfig(socket)
      } catch (error) {
        socket.emit(
          EVENTS.THEME_TEMPLATE.ERROR,
          error instanceof Error
            ? error.message
            : "errors:themeTemplate.saveFailed",
        )
      }
    }),
  )

  socket.on(
    EVENTS.THEME_TEMPLATE.DELETE,
    manager.withAuth(socket, async (payload: unknown) => {
      const result = z.object({ id: z.string() }).safeParse(payload)

      if (!result.success) {
        socket.emit(EVENTS.THEME_TEMPLATE.ERROR, result.error.issues[0].message)

        return
      }

      try {
        deleteThemeTemplate(result.data.id)
        socket.emit(EVENTS.THEME_TEMPLATE.DATA, await readThemeTemplates())
        await emitConfig(socket)
      } catch (error) {
        socket.emit(
          EVENTS.THEME_TEMPLATE.ERROR,
          error instanceof Error
            ? error.message
            : "errors:themeTemplate.notFound",
        )
      }
    }),
  )
}
