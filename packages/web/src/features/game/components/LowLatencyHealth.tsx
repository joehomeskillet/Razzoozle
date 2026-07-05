import { EVENTS } from "@razzoozle/common/constants"
import type { MetricsHealthSnapshot } from "@razzoozle/common/types/game/socket"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import clsx from "clsx"
import { Activity } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

// Optional host/admin "Low Latency Health" widget. Subscribes to the server's
// throttled metrics:health snapshot for the manager's own game and renders the
// RTT / clock-offset / answer-ack percentiles plus reconnect + rejected counts.
//
// VISIBILITY: the widget mounts on the manager header always, but renders
// NOTHING until the first metrics:health snapshot arrives. The server only emits
// that event while low-latency mode is enabled (a normal-mode game never
// replies to the subscribe), so "received a snapshot" is the authoritative,
// zero-plumbing signal that low-latency mode is on — mirroring how the player
// side latches on the presence of server-timing anchors. In normal mode this
// component is therefore invisible and inert.
//
// Every field is crash-guarded (?? / optional access): the docker build skips
// tsc, so a malformed/partial snapshot must never throw at runtime.

// Format a millisecond percentile value: "—" when null (no samples yet),
// otherwise a rounded integer with a "ms" suffix. Offsets can be negative.
const fmtMs = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)}ms`
    : "—"

interface RowProps {
  label: string
  p50: number | null | undefined
  p95: number | null | undefined
  count: number | undefined
}

const MetricRow = ({ label, p50, p95, count }: RowProps) => (
  <div className="flex items-center justify-between gap-4 py-0.5">
    <span className="text-white/70">{label}</span>
    <span className="font-mono tabular-nums">
      <span className="text-white">{fmtMs(p50)}</span>
      <span className="px-1 text-white/40">/</span>
      <span className="text-white/80">{fmtMs(p95)}</span>
      <span className="ml-1.5 text-[10px] text-white/40">(n={count ?? 0})</span>
    </span>
  </div>
)

const LowLatencyHealth = () => {
  const { socket } = useSocket()
  const { gameId } = useManagerStore()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<MetricsHealthSnapshot | null>(null)
  // True once we've ever received a health snapshot => low-latency mode is on.
  const seenRef = useRef(false)
  const [visible, setVisible] = useState(false)

  // Opt in to health snapshots for this game whenever (re)connected and we know
  // the gameId. A no-op on the server unless low-latency mode is enabled. Safe
  // to re-emit on reconnect — the server just sends a fresh immediate snapshot.
  useEffect(() => {
    if (!gameId) {
      return
    }

    socket.emit(EVENTS.METRICS.SUBSCRIBE, { gameId })
  }, [socket, gameId])

  // Re-subscribe after a reconnect so the widget keeps updating across drops.
  useEvent("connect", () => {
    if (gameId) {
      socket.emit(EVENTS.METRICS.SUBSCRIBE, { gameId })
    }
  })

  // Health snapshot handler — crash-guard every field. Receiving ANY snapshot
  // reveals the widget (low-latency mode confirmed on).
  useEvent(EVENTS.METRICS.HEALTH, (snap) => {
    if (!snap || typeof snap !== "object") {
      return
    }

    if (!seenRef.current) {
      seenRef.current = true
      setVisible(true)
    }

    setSnapshot(snap)
  })

  // Inert in normal mode: no snapshot ever arrives => nothing rendered.
  if (!visible) {
    return null
  }

  // Defensive reads: a partial snapshot must not throw.
  const rtt = snapshot?.rtt
  const offset = snapshot?.clockOffset
  const ack = snapshot?.answerAck
  const reconnectCount = snapshot?.reconnectCount ?? 0
  const rejected = snapshot?.rejected ?? {}
  const rejectedEntries = Object.entries(rejected).filter(
    ([, n]) => typeof n === "number" && n > 0,
  )
  const rejectedTotal = rejectedEntries.reduce(
    (sum, [, n]) => sum + (typeof n === "number" ? n : 0),
    0,
  )

  // A coarse health tint for the toggle dot: green by default, amber if RTT p95
  // is high or there are rejected answers. Purely cosmetic; never load-bearing.
  const rttP95 = typeof rtt?.p95 === "number" ? rtt.p95 : 0
  const degraded = rttP95 > 250 || rejectedTotal > 0

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("manager:lowLatency.title")}
        aria-label={t("manager:lowLatency.title")}
        className="flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-bold text-black hover:bg-gray-200"
      >
        <Activity className="size-4" />
        <span
          className={clsx(
            "size-2 rounded-full",
            degraded ? "bg-amber-500" : "bg-green-500",
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg bg-[var(--surface)] p-3 text-sm text-[color:var(--game-fg)] shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold">{t("manager:lowLatency.title")}</span>
            <span className="text-[10px] text-[color:var(--game-fg)]/40">
              {t("manager:lowLatency.p50p95")}
            </span>
          </div>

          <MetricRow
            label={t("manager:lowLatency.rtt")}
            p50={rtt?.p50}
            p95={rtt?.p95}
            count={rtt?.count}
          />
          <MetricRow
            label={t("manager:lowLatency.clockOffset")}
            p50={offset?.p50}
            p95={offset?.p95}
            count={offset?.count}
          />
          <MetricRow
            label={t("manager:lowLatency.answerAck")}
            p50={ack?.p50}
            p95={ack?.p95}
            count={ack?.count}
          />

          <div className="mt-2 border-t border-[color:var(--game-fg)]/15 pt-2">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[color:var(--game-fg)]/70">
                {t("manager:lowLatency.reconnects")}
              </span>
              <span className="font-mono tabular-nums">{reconnectCount}</span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[color:var(--game-fg)]/70">
                {t("manager:lowLatency.rejected")}
              </span>
              <span className="font-mono tabular-nums">{rejectedTotal}</span>
            </div>

            {rejectedEntries.length > 0 && (
              <div className="mt-1 space-y-0.5 text-[11px] text-[color:var(--game-fg)]/50">
                {rejectedEntries.map(([reason, n]) => (
                  <div
                    key={reason}
                    className="flex items-center justify-between"
                  >
                    <span>{reason}</span>
                    <span className="font-mono tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default LowLatencyHealth
