import { EVENTS } from "@razzia/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import ManagerPassword from "@razzia/web/features/manager/components/ManagerPassword"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ManagerAuthPage = () => {
  const { setConfig, setPassword } = useManagerStore()
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation()
  // The password the host just submitted, held only until the server confirms
  // it (CONFIG = AUTH success). It is persisted to the store ONLY on success so
  // an invalid password is never written there.
  const pendingPasswordRef = useRef<string | null>(null)
  // Timeout id for the post-AUTH "did the server ever answer?" guard.
  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAuthTimeout = () => {
    if (authTimeoutRef.current !== null) {
      clearTimeout(authTimeoutRef.current)
      authTimeoutRef.current = null
    }
  }

  useEffect(() => {
    if (!isConnected) {
      return
    }

    socket.emit(EVENTS.MANAGER.GET_CONFIG)
    // `socket` is a stable reference from the socket context for the lifetime of
    // the provider, so re-emitting only on `isConnected` change is correct.
  }, [isConnected, socket])

  // Clear any pending auth-timeout on unmount.
  useEffect(() => clearAuthTimeout, [])

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    clearAuthTimeout()
    // AUTH succeeded — only now is the submitted password trusted enough to keep.
    if (pendingPasswordRef.current !== null) {
      setPassword(pendingPasswordRef.current)
      pendingPasswordRef.current = null
    }
    setConfig(data)
    navigate({ to: "/manager/config" })
  })

  // A rejected password comes back as ERROR_MESSAGE (toasted by ManagerPassword).
  // Drop the pending password and the timeout so neither leaks past the failure.
  useEvent(EVENTS.MANAGER.ERROR_MESSAGE, () => {
    clearAuthTimeout()
    pendingPasswordRef.current = null
  })

  const handleAuth = (password: string) => {
    // Hold, do NOT persist yet — persistence happens in the CONFIG handler once
    // the server validates the password.
    pendingPasswordRef.current = password
    socket.emit(EVENTS.MANAGER.AUTH, password)

    // Minimal guard: if neither CONFIG nor ERROR_MESSAGE arrives, surface a
    // timeout instead of leaving the host on a silently-stuck form.
    clearAuthTimeout()
    authTimeoutRef.current = setTimeout(() => {
      authTimeoutRef.current = null
      pendingPasswordRef.current = null
      toast.error(
        t("manager:auth.timeout", {
          defaultValue: "No response from the server. Please try again.",
        }),
      )
    }, 8000)
  }

  return <ManagerPassword onSubmit={handleAuth} />
}

export const Route = createFileRoute("/(auth)/manager/")({
  component: ManagerAuthPage,
})
