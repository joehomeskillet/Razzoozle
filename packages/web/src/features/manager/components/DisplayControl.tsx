import { EVENTS } from "@razzia/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import Button from "@razzia/web/components/Button"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useOnClickOutside } from "@razzia/web/hooks/useOnClickOutside"
import clsx from "clsx"
import { Monitor, MonitorCheck } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Persistent phone-side remote control for the beamer/Raspberry-Pi satellite
// display. Lives in the manager game header so the admin can pair (or re-pair)
// the big screen at any point during the game — lobby, questions, results —
// straight from their phone. The Pi shows a short code on /display; the admin
// types it here and the server (which already holds the manager password +
// gameId) binds that on-screen kiosk to the live game.
const DisplayControl = () => {
  const { gameId, password } = useManagerStore()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [paired, setPaired] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useOnClickOutside({ ref: panelRef, handler: () => setOpen(false) })

  // Move focus into the code field when the popover opens.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  const pair = () => {
    if (!gameId || code.trim().length === 0) {
      return
    }

    // The server authorizes by manager-socket identity; password is sent only
    // for wire-compat (may be absent after a reload) and is ignored server-side.
    socket.emit(EVENTS.DISPLAY.PAIR, {
      code: code.trim().toUpperCase(),
      managerPassword: password ?? "",
      gameId,
    })
  }

  useEvent(EVENTS.DISPLAY.PAIR_SUCCESS, () => {
    setPaired(true)
    setCode("")
    setOpen(false)
    toast.success(t("manager:satellite.paired"))
  })

  useEvent(EVENTS.DISPLAY.PAIR_ERROR, (message) => {
    toast.error(t(message))
  })

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        title={t("manager:satellite.title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="display-control-popover"
        aria-label={t("manager:satellite.title")}
        // Paired keeps a green status fill (AA: green-800 on green-100) so the
        // host can see the beamer is bound at a glance; otherwise it reads as a
        // plain secondary control in the cluster.
        className={clsx("min-h-11", {
          "border-green-200 bg-green-100 text-green-800 hover:bg-green-200 active:bg-green-200":
            paired,
        })}
      >
        {paired ? (
          <MonitorCheck className="size-5" aria-hidden />
        ) : (
          <Monitor className="size-5" aria-hidden />
        )}
        <span className="hidden sm:inline">
          {paired ? t("manager:satellite.paired") : t("manager:tabs.satellite")}
        </span>
      </Button>

      {open && (
        <div
          id="display-control-popover"
          role="dialog"
          aria-label={t("manager:satellite.title")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false)
            }
          }}
          className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg bg-white p-3 text-left text-black shadow-xl"
        >
          <p className="text-sm font-bold">{t("manager:satellite.title")}</p>
          <p className="mt-1 text-xs leading-snug text-gray-600">
            {t("manager:satellite.howto")}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pair()}
              placeholder={t("manager:satellite.codePlaceholder")}
              aria-label={t("manager:satellite.codeLabel")}
              maxLength={6}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-center font-mono text-lg font-bold tracking-widest uppercase outline-none focus:border-gray-500"
            />
            <button
              type="button"
              onClick={pair}
              disabled={!gameId || code.trim().length === 0}
              className="bg-primary shrink-0 rounded-md px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {t("manager:satellite.pair")}
            </button>
          </div>
          {paired && (
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-green-700">
              <MonitorCheck className="size-4" />
              {t("manager:satellite.paired")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default DisplayControl
