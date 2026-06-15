import Room from "@razzia/web/features/game/components/join/Room"
import Username from "@razzia/web/features/game/components/join/Username"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const PlayerAuthPage = () => {
  const { isConnected, connect } = useSocket()
  const { player } = usePlayerStore()
  const { t } = useTranslation()

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  useEvent("game:errorMessage", (message) => {
    toast.error(t(message))
  })

  if (player) {
    return <Username />
  }

  return (
    <>
      <Room />
      {/* Full navigation to the trophies page (route.gen.ts auto-regens on build) */}
      <a
        href="/trophies"
        className="text-primary focus-visible:ring-primary/40 mt-3 block text-center text-sm font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        🏆 {t("game:achievements.gallery.title", "Trophäen")}
      </a>
    </>
  )
}

export const Route = createFileRoute("/(auth)/")({
  component: PlayerAuthPage,
})
