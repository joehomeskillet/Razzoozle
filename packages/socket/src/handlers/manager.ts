import {
  DEFAULT_MANAGER_PASSWORD,
  EVENTS,
  type ThemeSlot,
} from "@razzia/common/constants"
import type { SocketContext } from "@razzia/socket/handlers/types"
import {
  getGameConfig,
  getTheme,
  saveBackgroundImage,
  setTheme,
} from "@razzia/socket/services/config"
import manager, { emitConfig } from "@razzia/socket/services/manager"

export const managerSocketHandlers = ({ socket }: SocketContext) => {
  socket.on(
    EVENTS.MANAGER.GET_CONFIG,
    manager.withAuth(socket, () => {
      emitConfig(socket)
    }),
  )

  // Public: any client (player or manager) may read the theme to apply it.
  socket.on(EVENTS.MANAGER.GET_THEME, () => {
    socket.emit(EVENTS.MANAGER.THEME, getTheme())
  })

  socket.on(
    EVENTS.MANAGER.SET_THEME,
    manager.withAuth(socket, (payload: unknown) => {
      try {
        const theme = setTheme(payload)
        socket.emit(EVENTS.MANAGER.SET_THEME_SUCCESS, theme)
        // Live-update every other connected client.
        socket.broadcast.emit(EVENTS.MANAGER.THEME, theme)
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.THEME_ERROR,
          error instanceof Error ? error.message : "errors:theme.saveFailed",
        )
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.UPLOAD_BACKGROUND,
    manager.withAuth(
      socket,
      (payload: { slot: ThemeSlot; dataUrl: string }) => {
        try {
          const path = saveBackgroundImage(payload.slot, payload.dataUrl)
          socket.emit(EVENTS.MANAGER.BACKGROUND_UPLOADED, {
            slot: payload.slot,
            path,
          })
        } catch (error) {
          socket.emit(
            EVENTS.MANAGER.THEME_ERROR,
            error instanceof Error
              ? error.message
              : "errors:theme.uploadFailed",
          )
        }
      },
    ),
  )

  socket.on(EVENTS.MANAGER.LOGOUT, () => {
    manager.logout(socket)
  })

  socket.on(EVENTS.MANAGER.AUTH, (password) => {
    try {
      const config = getGameConfig()

      if (config.managerPassword === DEFAULT_MANAGER_PASSWORD) {
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:manager.passwordNotConfigured",
        )

        return
      }

      if (password !== config.managerPassword) {
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:manager.invalidPassword",
        )

        return
      }

      manager.login(socket)
      emitConfig(socket)
    } catch (error) {
      console.error("Failed to read game config:", error)
      socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, "errors:failedToReadConfig")
    }
  })
}
