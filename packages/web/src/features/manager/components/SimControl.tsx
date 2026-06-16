import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import Button from "@razzia/web/components/Button"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useOnClickOutside } from "@razzia/web/hooks/useOnClickOutside"
import clsx from "clsx"
import { Bot } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

const SimControl = () => {
  const { gameId, status } = useManagerStore()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(5)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const windowOpen = status?.name === STATUS.SELECT_ANSWER

  useOnClickOutside({ ref: panelRef, handler: () => setOpen(false) })

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  // The pre-game password screen owns the only other ERROR_MESSAGE listener, but
  // it's unmounted once the game starts. Without this in-game listener, a server
  // rejection of ADD_BOTS would fail silently. We only surface sim-related errors
  // here (and reopen the popover) so the host sees why the add didn't take.
  useEvent(
    EVENTS.MANAGER.ERROR_MESSAGE,
    useCallback((message: string) => {
      if (message.startsWith("errors:manager.sim")) {
        setError(message)
        setOpen(true)
      }
    }, []),
  )

  const addBots = () => {
    if (!gameId || count < 1 || windowOpen) {
      return
    }

    setError(null)
    socket.emit(EVENTS.MANAGER.ADD_BOTS, { gameId, count })
    setOpen(false)
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          setOpen((v) => {
            const next = !v
            if (next) {
              setError(null)
            }
            return next
          })
        }
        title={t("manager:sim.button")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="sim-control-popover"
        aria-label={t("manager:sim.button")}
        className={clsx("min-h-11")}
      >
        <Bot className="size-5" aria-hidden />
        <span className="hidden sm:inline">{t("manager:sim.button")}</span>
      </Button>

      {open && (
        <div
          id="sim-control-popover"
          role="dialog"
          aria-label={t("manager:sim.button")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false)
            }
          }}
          className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg bg-white p-3 text-left text-black shadow-xl"
        >
          <p className="text-sm font-bold">{t("manager:sim.button")}</p>
          <div className="mt-2 flex gap-2">
            <label className="sr-only" htmlFor="sim-control-count">
              {t("manager:sim.count")}
            </label>
            <input
              id="sim-control-count"
              ref={inputRef}
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => {
                setError(null)
                setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !windowOpen) {
                  addBots()
                }
              }}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-center font-bold outline-none focus:border-gray-500"
            />
            <button
              type="button"
              onClick={addBots}
              disabled={!gameId || count < 1 || windowOpen}
              className="bg-primary shrink-0 rounded-md px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {t("manager:sim.add")}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs leading-snug text-red-600" role="alert">
              {t(error)}
            </p>
          )}
          {windowOpen && (
            <p className="mt-2 text-xs leading-snug text-gray-600">
              {t("manager:sim.windowHint")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default SimControl
