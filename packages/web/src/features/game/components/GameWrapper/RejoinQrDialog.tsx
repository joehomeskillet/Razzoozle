import * as AlertDialog from "@radix-ui/react-alert-dialog"
import { EVENTS } from "@razzoozle/common/constants"
import type { Status } from "@razzoozle/common/types/game/status"
import { STATUS } from "@razzoozle/common/types/game/status"
import Button from "@razzoozle/web/components/Button"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { buildJoinUrl } from "@razzoozle/web/features/game/utils/joinUrl"
import { useOnClickOutside } from "@razzoozle/web/hooks/useOnClickOutside"
import { Pause, Play, QrCode, X } from "lucide-react"
import QRCode from "@razzoozle/web/components/QRCode"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

type Props = {
  inviteCode: string
  statusName: Status | undefined
}

const RejoinQrDialog = ({ inviteCode, statusName }: Props) => {
  const { socket } = useSocket()
  const { gameId } = useManagerStore()
  const { t } = useTranslation()
  const [qrOpen, setQrOpen] = useState(false)
  const qrContentRef = useRef<HTMLDivElement>(null)

  useOnClickOutside({ ref: qrContentRef, handler: () => setQrOpen(false) })

  // Pause is only meaningful between questions; the server rejects it mid-round
  // (and emits an ERROR_MESSAGE that the existing toast surfaces). The button
  // flips to Resume while the game is held in STATUS.PAUSED.
  const isPaused = statusName === STATUS.PAUSED
  const pauseGame = () => {
    socket.emit(EVENTS.MANAGER.PAUSE_GAME, { gameId: gameId ?? undefined })
  }
  const resumeGame = () => {
    socket.emit(EVENTS.MANAGER.RESUME_GAME, { gameId: gameId ?? undefined })
  }

  return (
    <AlertDialog.Root open={qrOpen} onOpenChange={setQrOpen}>
      <AlertDialog.Trigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="min-h-11 min-w-11"
          title={t("game:rejoin")}
          aria-label={t("game:rejoin")}
        >
          <QrCode className="size-5" aria-hidden />
        </Button>
      </AlertDialog.Trigger>

      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <AlertDialog.Content
          ref={qrContentRef}
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6 text-[color:var(--color-field-ink)] shadow-[var(--shadow-flat)]"
        >
          <AlertDialog.Title className="text-2xl font-bold">
            {t("game:rejoin")}
          </AlertDialog.Title>
          <button
            type="button"
            onClick={() => setQrOpen(false)}
            className="absolute -top-3 -right-3 rounded-full border border-[var(--border-hairline)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-flat)] hover:brightness-95"
            aria-label={t("common:cancel")}
          >
            <X className="size-6 text-[color:var(--color-field-ink)]" />
          </button>
          <QRCode
            className="size-56 md:size-64"
            size={300}
            value={buildJoinUrl(inviteCode)}
          />
          <div className="font-mono text-3xl font-bold tracking-widest">
            {inviteCode}
          </div>
          <p className="text-center text-sm text-[color:var(--color-field-ink)] opacity-70">
            {t("game:pause.resumeHint")}
          </p>
          <div className="flex w-full justify-center gap-3">
            {isPaused ? (
              <Button
                variant="primary"
                size="sm"
                className="min-h-11 px-5"
                onClick={resumeGame}
              >
                <Play className="size-5" aria-hidden />
                {t("game:pause.resumeGame")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11 px-5"
                onClick={pauseGame}
              >
                <Pause className="size-5" aria-hidden />
                {t("game:pause.pauseGame")}
              </Button>
            )}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export default RejoinQrDialog
