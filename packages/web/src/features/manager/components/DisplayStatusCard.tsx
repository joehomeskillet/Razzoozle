import {
  DISPLAY_STALE_MS,
  EVENTS,
} from "@razzoozle/common/constants"
import { useEvent } from "@razzoozle/web/features/game/contexts/socket-context"
import { useOnClickOutside } from "@razzoozle/web/hooks/useOnClickOutside"
import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { Monitor } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

// WP-15 — manager-facing live status card for paired satellite displays.
//
// Subscribes to DISPLAY.STATUS (server pushes the current display list to THIS
// manager socket on every pair / ping / disconnect, plus reconnect self-heals
// via the next 10s ping). Renders each display's name, a relative "last seen"
// and an online/stale badge derived from lastPingAt vs DISPLAY_STALE_MS.
//
// Lives in the manager game header alongside DisplayControl, so the host can see
// at a glance whether the beamer is alive without leaving the game screen.

interface DisplayRow {
  socketId: string
  name: string
  lastPingAt: number // epoch seconds (dayjs().unix())
}

const STALE_SECONDS = DISPLAY_STALE_MS / 1000

const DisplayStatusCard = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [displays, setDisplays] = useState<DisplayRow[]>([])
  // A ticking "now" (epoch seconds) so the relative "last seen" and the
  // online/stale badge re-evaluate every second without a server round-trip.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const panelRef = useRef<HTMLDivElement>(null)

  useOnClickOutside({ ref: panelRef, handler: () => setOpen(false) })

  useEvent(EVENTS.DISPLAY.STATUS, ({ displays: next }) => {
    setDisplays(next)
  })

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000))
    }, 1000)

    return () => {
      clearInterval(id)
    }
  }, [])

  // Online = at least one display seen within the staleness window. Drives the
  // button's status fill so the host sees a connected beamer at a glance.
  const onlineCount = displays.filter(
    (d) => now - d.lastPingAt <= STALE_SECONDS,
  ).length

  return (
    <div
      className="relative"
      ref={panelRef}
      onKeyDown={(e) => {
        // Escape closes the disclosure. Bound on the wrapper so it fires while
        // focus is still on the trigger button (the panel never takes focus).
        if (e.key === "Escape" && open) {
          setOpen(false)
        }
      }}
    >
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        title={t("manager:display.status.title")}
        aria-expanded={open}
        aria-controls="display-status-popover"
        aria-label={t("manager:display.status.title")}
        className={clsx("min-h-11", {
          "border-green-200 bg-green-100 text-green-800 hover:bg-green-200 active:bg-green-200":
            onlineCount > 0,
        })}
      >
        <Monitor className="size-5" aria-hidden />
        <span className="hidden tabular-nums sm:inline">
          {displays.length}
        </span>
      </Button>

      {open && (
        <div
          id="display-status-popover"
          role="region"
          aria-label={t("manager:display.status.title")}
          className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg bg-white p-3 text-left text-black shadow-xl"
        >
          <p className="text-sm font-bold">
            {t("manager:display.status.title")}
          </p>

          {displays.length === 0 ? (
            <p className="mt-2 text-xs leading-snug text-gray-600">
              {t("manager:display.status.empty")}
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {displays.map((d) => {
                const ageSeconds = Math.max(0, now - d.lastPingAt)
                const stale = ageSeconds > STALE_SECONDS

                return (
                  <li
                    key={d.socketId}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {d.name ||
                          t("manager:display.status.unnamed", {
                            defaultValue: "Beamer",
                          })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {t("manager:display.status.lastSeen", {
                          seconds: ageSeconds,
                        })}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                        stale
                          ? "bg-gray-200 text-gray-600"
                          : "bg-green-100 text-green-800",
                      )}
                    >
                      {stale
                        ? t("manager:display.status.stale")
                        : t("manager:display.status.online")}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default DisplayStatusCard
