import Room from "@razzoozle/web/features/game/components/join/Room"
import Username from "@razzoozle/web/features/game/components/join/Username"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
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
      {/* Landing page heading. The Background only renders a visible <h1> when a
          themed appTitle is set (logo/default branches use an <img>), so this
          sr-only <h1> guarantees the entry page always exposes a top-level
          heading to assistive tech / outline parsing. */}
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
