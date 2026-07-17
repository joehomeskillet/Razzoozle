import { EVENTS } from "@razzoozle/common/constants"
import type { ClientToServerEvents } from "@razzoozle/common/types/game/socket"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"

const OPTIMISTIC_TOAST_DELAY_MS = 300

type GameConfigPatch = Parameters<
  ClientToServerEvents[typeof EVENTS.MANAGER.SET_GAME_CONFIG]
>[0]

interface UseOptimisticConfigToggleOptions<K extends keyof GameConfigPatch> {
  /** Local state setter for the persisted value (e.g. a `useState` setter). */
  setValue: (next: NonNullable<GameConfigPatch[K]>) => void
  /** Key this toggle patches in the `manager:setGameConfig` payload. */
  patchKey: K
  /** Success toast text for the value just committed. */
  toastMessage: (next: NonNullable<GameConfigPatch[K]>) => string
  /** Optional extra effect run before the socket emit (e.g. a localStorage mirror). */
  sideEffect?: (next: NonNullable<GameConfigPatch[K]>) => void
}

/**
 * Shared optimistic-update plumbing for the `ConfigGameMode` toggles: sets
 * local state immediately, emits a `manager:setGameConfig` patch, and shows a
 * debounced success toast once the server has had a beat to persist it
 * (mirrors the SET_THEME pattern — SET_GAME_CONFIG has no ack).
 */
export const useOptimisticConfigToggle = <K extends keyof GameConfigPatch>({
  setValue,
  patchKey,
  toastMessage,
  sideEffect,
}: UseOptimisticConfigToggleOptions<K>) => {
  const { socket } = useSocket()
  const [saving, setSaving] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending optimistic-toast timeout on unmount.
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const commit = (next: NonNullable<GameConfigPatch[K]>) => {
    setValue(next)
    setSaving(true)
    sideEffect?.(next)

    // Emit a partial patch; server merges it into the persisted GameConfig.
    socket.emit(EVENTS.MANAGER.SET_GAME_CONFIG, {
      [patchKey]: next,
    } as GameConfigPatch)

    // ponytail: server SET_GAME_CONFIG has no ack; toast is optimistic
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      setSaving(false)
      toast.success(toastMessage(next))
    }, OPTIMISTIC_TOAST_DELAY_MS)
  }

  return { saving, commit }
}
