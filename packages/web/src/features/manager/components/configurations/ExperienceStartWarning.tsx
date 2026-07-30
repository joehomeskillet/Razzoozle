import { EVENTS } from "@razzoozle/common/constants"
import type { ServerToClientEvents } from "@razzoozle/common/types/game/socket"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

export type StartWarningPayload = Parameters<
  ServerToClientEvents[typeof EVENTS.MANAGER.START_WARNING]
>[0]

export interface ExperienceStartWarningViewProps {
  warning: StartWarningPayload | null
  onConfirm: () => void
  onDismiss: () => void
}

/**
 * Pure presentational half of the E-11rev soft start-gate dialog — split out
 * from the socket-wiring container so it is directly testable. `useEvent`
 * subscribes via `useEffect`, which never runs during `renderToStaticMarkup`
 * — a static render can't exercise the socket flow anyway, so the container
 * itself stays untested and this view carries all dialog-state coverage.
 */
export const ExperienceStartWarningView = ({
  warning,
  onConfirm,
  onDismiss,
}: ExperienceStartWarningViewProps) => {
  const { t } = useTranslation()

  return (
    <AlertDialog
      open={warning !== null}
      onOpenChange={(open) => {
        if (!open) {
          onDismiss()
        }
      }}
      title={t("manager:startWarning.title")}
      description={t(
        `manager:startWarning.${warning?.reason ?? "teamSetupIncomplete"}`,
      )}
      confirmLabel={t("manager:startWarning.confirmAnyway")}
      onConfirm={onConfirm}
    />
  )
}

interface ExperienceStartWarningProps {
  /** Game id of the host's own game — forwarded on the confirmed re-start. */
  gameId?: string | null
}

/**
 * WP-EXP-05 (E-11rev/E-12rev) — client side of the server's soft start
 * gates for experience modes (emit sites: rust/server/.../game_flow/mod.rs
 * and game_flow/experience.rs):
 *
 * - `teamSetupIncomplete` (E-11rev, e.g. pyramid_climb without team mode /
 *   <2 non-empty teams): warning, NOT a hard block. Opens a confirm dialog;
 *   "Trotzdem starten" re-emits MANAGER.START_GAME with `confirmed: true`.
 * - `unscoredFiltered` (E-12rev): fire-and-forget toast with the exact spec
 *   wording — the game starts anyway, N comes from the server payload.
 *
 * Rendered by the host route (/party/manager/$gameId); the warning is emitted
 * socket-direct to the starting manager, so displays/players never see it.
 */
const ExperienceStartWarning = ({ gameId }: ExperienceStartWarningProps) => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const [warning, setWarning] = useState<StartWarningPayload | null>(null)

  useEvent(EVENTS.MANAGER.START_WARNING, (payload) => {
    if (payload.reason === "unscoredFiltered") {
      // E-12rev: exact wording — "{{count}} Fragen können in diesem Modus
      // nicht verwendet werden und werden übersprungen".
      toast(
        t("manager:selectQuizz.experienceMode.skippedQuestions", {
          count: payload.skipped ?? 0,
        }),
      )
      return
    }
    setWarning(payload)
  })

  const handleConfirm = () => {
    socket.emit(EVENTS.MANAGER.START_GAME, {
      gameId: gameId ?? undefined,
      confirmed: true,
    })
    setWarning(null)
  }

  return (
    <ExperienceStartWarningView
      warning={warning}
      onConfirm={handleConfirm}
      onDismiss={() => setWarning(null)}
    />
  )
}

export default ExperienceStartWarning
