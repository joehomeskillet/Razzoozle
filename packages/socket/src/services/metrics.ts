// Low-latency mode observability. In-memory, per-room percentile metrics that
// are collected ONLY when lowLatencyMode is enabled. Everything here is a pure
// no-op cost in normal mode (the round/game code never calls record* unless the
// flag is on), so this file cannot change today's behaviour.
//
// Kept deliberately tiny: bounded ring buffers + a p50/p95 getter. No timers,
// no I/O, no external deps. A room's metrics are dropped on demand via clear().

import type { MetricsHealthSnapshot } from "@razzoozle/common/types/game/socket"
import {
  answerAckLatencyMs,
  answersRejectedTotal,
  clockRttMs,
} from "@razzoozle/socket/services/prom"

const MAX_SAMPLES = 200

type Sample = number

interface RoomMetrics {
  rtt: Sample[]
  clockOffset: Sample[]
  answerAck: Sample[]
  reconnectCount: number
  // Rejected answers grouped by reason (ok answers are NOT counted here)
  rejected: Record<string, number>
}

const rooms = new Map<string, RoomMetrics>()

const emptyRoom = (): RoomMetrics => ({
  rtt: [],
  clockOffset: [],
  answerAck: [],
  reconnectCount: 0,
  rejected: {},
})

const getRoom = (gameId: string): RoomMetrics => {
  let room = rooms.get(gameId)

  if (!room) {
    room = emptyRoom()
    rooms.set(gameId, room)
  }

  return room
}

// Append to a bounded ring buffer (drop oldest) so a long game can't grow
// unbounded on a flaky network that produces thousands of samples.
const push = (buf: Sample[], value: number): void => {
  buf.push(value)

  if (buf.length > MAX_SAMPLES) {
    buf.shift()
  }
}

const percentile = (values: Sample[], p: number): number | null => {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((a, b) => a - b)
  // Nearest-rank: index = ceil(p/100 * N) - 1, clamped into range.
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  const index = Math.min(Math.max(rank, 0), sorted.length - 1)

  return sorted[index]
}

export const metrics = {
  recordRtt(gameId: string, rttMs: number): void {
    push(getRoom(gameId).rtt, rttMs)
    // prom histogram .observe() — reached ONLY from LL-gated callers.
    clockRttMs.observe(rttMs)
  },

  recordClockOffset(gameId: string, offsetMs: number): void {
    push(getRoom(gameId).clockOffset, offsetMs)
  },

  recordAnswerAck(gameId: string, latencyMs: number): void {
    push(getRoom(gameId).answerAck, latencyMs)
    // prom histogram .observe() — reached ONLY from LL-gated callers.
    answerAckLatencyMs.observe(latencyMs)
  },

  recordReconnect(gameId: string): void {
    getRoom(gameId).reconnectCount += 1
  },

  recordRejected(gameId: string, reason: string): void {
    const room = getRoom(gameId)
    room.rejected[reason] = (room.rejected[reason] ?? 0) + 1
    // bounded label — `reason` is a fixed enum, never an id.
    answersRejectedTotal.inc({ reason })
  },

  // P50/p95 snapshot for a room. Safe to call any time; returns nulls when no
  // samples exist yet (the health widget defaults those to "—"). The shape is
  // the shared MetricsHealthSnapshot wire contract (common layer).
  snapshot(gameId: string): MetricsHealthSnapshot {
    const room = rooms.get(gameId) ?? emptyRoom()

    return {
      rtt: {
        p50: percentile(room.rtt, 50),
        p95: percentile(room.rtt, 95),
        count: room.rtt.length,
      },
      clockOffset: {
        p50: percentile(room.clockOffset, 50),
        p95: percentile(room.clockOffset, 95),
        count: room.clockOffset.length,
      },
      answerAck: {
        p50: percentile(room.answerAck, 50),
        p95: percentile(room.answerAck, 95),
        count: room.answerAck.length,
      },
      reconnectCount: room.reconnectCount,
      rejected: { ...room.rejected },
    }
  },

  clear(gameId: string): void {
    rooms.delete(gameId)
  },
}

