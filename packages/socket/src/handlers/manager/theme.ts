import {
  EVENTS,
  type SoundSlot,
  type ThemeSlot,
} from "@razzoozle/common/constants"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  getTheme,
  resetSkeleton,
  saveBackgroundImage,
  saveSoundFile,
  setSkeletonAsset,
  setTheme,
} from "@razzoozle/socket/services/config"
import manager, { emitConfig } from "@razzoozle/socket/services/manager"

export const registerThemeHandlers = ({ socket }: SocketContext) => {
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
    EVENTS.MANAGER.SET_SKELETON_ASSET,
    manager.withAuth(
      socket,
      (payload: { kind: "css" | "js"; content: string }) => {
        try {
          if (payload?.kind !== "css" && payload?.kind !== "js") {
            throw new Error("errors:skeleton.invalidKind")
          }

          if (typeof payload.content !== "string") {
            throw new Error("errors:skeleton.invalidContent")
          }

          const theme = setSkeletonAsset(payload.kind, payload.content)
          socket.broadcast.emit(EVENTS.MANAGER.THEME, theme)
          socket.emit(EVENTS.MANAGER.THEME, theme)
          socket.emit(EVENTS.MANAGER.SET_SKELETON_ASSET_SUCCESS, {
            kind: payload.kind,
          })
        } catch (error) {
          socket.emit(
            EVENTS.MANAGER.THEME_ERROR,
            error instanceof Error ? error.message : "errors:theme.saveFailed",
          )
        }
      },
    ),
  )

  socket.on(
    EVENTS.MANAGER.RESET_SKELETON,
    manager.withAuth(socket, () => {
      try {
        const theme = resetSkeleton()
        socket.broadcast.emit(EVENTS.MANAGER.THEME, theme)
        socket.emit(EVENTS.MANAGER.THEME, theme)
        socket.emit(EVENTS.MANAGER.RESET_SKELETON_SUCCESS)
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
      async (payload: { slot: ThemeSlot; dataUrl: string }) => {
        try {
          const path = await saveBackgroundImage(payload.slot, payload.dataUrl)
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

  // Sound-pack upload (mirrors UPLOAD_BACKGROUND, but for audio — no transcode).
  // Validates the slot + audio MIME + size cap in saveSoundFile, writes the file,
  // stores the returned assetRef on theme.sounds[slot], persists, then emits
  // SOUND_UPLOADED to the requester and broadcasts the new theme to everyone else.
  socket.on(
    EVENTS.MANAGER.UPLOAD_SOUND,
    manager.withAuth(
      socket,
      async (payload: { slot: SoundSlot; dataUrl: string }) => {
        try {
          const assetRef = await saveSoundFile(payload.slot, payload.dataUrl)
          const current = getTheme()
          const theme = setTheme({
            ...current,
            sounds: { ...current.sounds, [payload.slot]: assetRef },
          })
          socket.emit(EVENTS.MANAGER.SOUND_UPLOADED, {
            slot: payload.slot,
            assetRef,
          })
          socket.broadcast.emit(EVENTS.MANAGER.THEME, theme)
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
}
