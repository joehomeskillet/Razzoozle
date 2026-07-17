import { EVENTS } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useOnClickOutside } from "@razzoozle/web/hooks/useOnClickOutside"
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
  // Tracks the previous `open` value so focus is only restored to the trigger
  // on a genuine close (not on the initial mount, which would steal focus).
  const wasOpenRef = useRef(false)

  useOnClickOutside({ ref: panelRef, handler: () => setOpen(false) })

  // Focus the code field when the popover opens; restore focus to the trigger
  // button when it closes (minimal focus trap entry + restoration). The trigger
  // is the first button in the wrapper (Button doesn't forward a ref).
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else if (wasOpenRef.current) {
      panelRef.current?.querySelector("button")?.focus()
    }
    wasOpenRef.current = open
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
    toast.error(t(message, { defaultValue: message }))
  })

  // The server re-pushes the live display list on every pair / ping / kiosk
  // disconnect. When no displays remain, the beamer is gone, so drop the paired
  // status (it was previously latched true forever after the first PAIR_SUCCESS).
  useEvent(EVENTS.DISPLAY.STATUS, ({ displays }) => {
    if (Array.isArray(displays) && displays.length === 0) {
      setPaired(false)
    }
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
          "border-[var(--status-online-bg)] bg-[var(--status-online-bg)] text-[var(--status-online-text)] hover:opacity-90 active:opacity-80":
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
          className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg bg-[var(--surface)] p-3 text-left text-[var(--ink)] shadow-[var(--shadow-flat)]"
        >
          <p className="text-sm font-bold">{t("manager:satellite.title")}</p>
          <p className="mt-1 text-xs leading-snug text-[var(--ink-medium)]">
            {t("manager:satellite.howto")}
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pair()}
              placeholder={t("manager:satellite.codePlaceholder")}
              aria-label={t("manager:satellite.codeLabel")}
              maxLength={6}
              variant="md"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={pair}
              disabled={!gameId || code.trim().length === 0}
            >
              {t("manager:satellite.pair")}
            </Button>
          </div>
          {paired && (
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-[var(--status-online-text)]">
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
