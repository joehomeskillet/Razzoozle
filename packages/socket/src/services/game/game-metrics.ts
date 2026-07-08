import type {
  MetricKind,
  MetricsHealthSnapshot,
  Server,
} from "@razzoozle/common/types/game/socket"
import type { LowLatencyMode } from "@razzoozle/common/validators/game-config"
import { EVENTS } from "@razzoozle/common/constants"
import { metrics } from "@razzoozle/socket/services/metrics"

/**
 * Check and record a client-measured metric sample (RTT, clock-offset, or answer-ack latency).
 * Gated by lowLatency.enabled; in normal mode this is inert.
 * Returns true if a health push should be scheduled.
 */
export function recordMetricImpl(
  gameId: string,
  kind: MetricKind,
  value: number,
  lowLatency: LowLatencyMode,
): boolean {
  if (!lowLatency.enabled) {
    return false
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false
  }

  switch (kind) {
    case "rtt":
      metrics.recordRtt(gameId, value)
      break

    case "clockOffset":
      metrics.recordClockOffset(gameId, value)
      break

    case "answerAck":
      metrics.recordAnswerAck(gameId, value)
      break

    default:
      // Unknown kind from a future/garbled client — ignore safely.
      return false
  }

  return true
}

/**
 * Check if a manager socket can subscribe to health metrics.
 */
export function canSubscribeMetricsImpl(
  managerSocketId: string,
  requestingSocketId: string,
  lowLatency: LowLatencyMode,
): boolean {
  if (!lowLatency.enabled) {
    return false
  }

  return managerSocketId === requestingSocketId
}

/**
 * Emit health metrics to the manager socket.
 */
export function emitHealthMetricsImpl(
  io: Server,
  managerSocketId: string,
  snapshot: MetricsHealthSnapshot,
): void {
  io.to(managerSocketId).emit(EVENTS.METRICS.HEALTH, snapshot)
}

/**
 * Schedule a throttled health push to the manager.
 * Requires callbacks for getting/setting timer state since it can't access instance fields directly.
 * Returns the timer ID if a new timer was scheduled, or null if throttled.
 */
export function scheduleHealthPushImpl(
  io: Server,
  managerSocketId: string,
  getMetrics: () => MetricsHealthSnapshot,
  hasActiveTimer: () => boolean,
  throttleMs: number,
): ReturnType<typeof setTimeout> | null {
  if (hasActiveTimer()) {
    return null
  }

  const timer = setTimeout(() => {
    // Only the manager socket receives health; players never see metrics.
    io.to(managerSocketId).emit(EVENTS.METRICS.HEALTH, getMetrics())
  }, throttleMs)

  return timer
}
