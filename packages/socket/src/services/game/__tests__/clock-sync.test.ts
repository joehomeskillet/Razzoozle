// Clock-sync math unit tests + an optional real-socket.io integration test.
//
// Unit: the pure clock-offset estimator (common/utils/clock-sync) — median of N
// samples with high-rtt outlier rejection. UI-only; never a scoring input.
//
// Integration: a real socket.io server + socket.io-client pair. We wire the
// ACTUAL RoundManager.selectAnswer over the wire (the server-side socket the
// client connects to is the real one, with handshake.auth.clientId) and assert:
//   - the answer ack arrives with reason "ok" for the first tap,
//   - a re-sent same tap (same clientMessageId) is acked "duplicate" and is a
//     server-side no-op (idempotency),
//   - a clock:ping is answered by clock:pong echoing the client mono ts.
// Kept here with short timeouts; if the ephemeral port bind/timing flakes in a
// constrained CI it fails fast rather than hanging — the unit tests above still
// cover the core contract.

import { EVENTS } from "@razzoozle/common/constants"
import type { Quizz } from "@razzoozle/common/types/game"
import type { AnswerAck } from "@razzoozle/common/types/game/socket"
import {
  computeClockOffset,
  median,
  type ClockSample,
} from "@razzoozle/common/utils/clock-sync"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildRound, enabledLL, makePlayer } from "./helpers"

// ── Unit: clock-offset median + outlier rejection ───────────────────────────

describe("median()", () => {
  it("returns the middle of an odd-length list", () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it("averages the two middles of an even-length list", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it("returns 0 for an empty list (caller guards)", () => {
    expect(median([])).toBe(0)
  })
})

describe("computeClockOffset(): median of 5 + outlier rejection", () => {
  // Build a sample with a chosen rtt and a "true" server offset. We place the
  // server timestamp at the midpoint so the recovered offset equals `offset`
  // exactly for a symmetric path.
  const sample = (
    sendMono: number,
    rtt: number,
    offset: number,
  ): ClockSample => ({
    clientSendMonoMs: sendMono,
    clientRecvMonoMs: sendMono + rtt,
    // ServerNow taken at the round-trip midpoint = sendMono + rtt/2 + offset.
    serverNowMs: sendMono + rtt / 2 + offset,
  })

  it("recovers the offset as the median across clean samples", () => {
    const TRUE_OFFSET = 5_000
    const samples = [
      sample(0, 40, TRUE_OFFSET),
      sample(100, 50, TRUE_OFFSET),
      sample(200, 45, TRUE_OFFSET),
      sample(300, 55, TRUE_OFFSET),
      sample(400, 48, TRUE_OFFSET),
    ]

    const result = computeClockOffset(samples)
    expect(result).not.toBeNull()
    expect(result?.offsetMs).toBe(TRUE_OFFSET)
    expect(result?.sampleCount).toBe(5)
  })

  it("rejects a high-rtt outlier so it can't skew the median", () => {
    const TRUE_OFFSET = 1_000
    // Four tight ~50ms samples + one congested 5000ms round-trip whose midpoint
    // estimate is badly skewed. The outlier must be dropped.
    const samples = [
      sample(0, 50, TRUE_OFFSET),
      sample(100, 52, TRUE_OFFSET),
      sample(200, 48, TRUE_OFFSET),
      sample(300, 51, TRUE_OFFSET),
      // Congested: rtt 5000ms AND a wrong apparent offset (e.g. +900 skew)
      {
        clientSendMonoMs: 400,
        clientRecvMonoMs: 400 + 5_000,
        serverNowMs: 400 + 5_000 / 2 + TRUE_OFFSET + 900,
      },
    ]

    const result = computeClockOffset(samples)
    expect(result).not.toBeNull()
    // The outlier is excluded ⇒ offset stays at the clean ~1000, NOT pulled
    // toward 1900, and the surviving sample count drops to 4.
    expect(result?.sampleCount).toBe(4)
    expect(result?.offsetMs).toBe(TRUE_OFFSET)
  })

  it("drops samples with a negative / non-finite rtt", () => {
    const samples: ClockSample[] = [
      // Clock went backwards (recv before send) — invalid.
      { clientSendMonoMs: 100, clientRecvMonoMs: 50, serverNowMs: 1_000 },
      // NaN server clock — invalid.
      { clientSendMonoMs: 0, clientRecvMonoMs: 40, serverNowMs: NaN },
      // One good sample, offset 2000.
      { clientSendMonoMs: 0, clientRecvMonoMs: 40, serverNowMs: 20 + 2_000 },
    ]

    const result = computeClockOffset(samples)
    expect(result).not.toBeNull()
    expect(result?.sampleCount).toBe(1)
    expect(result?.offsetMs).toBe(2_000)
  })

  it("returns null for entirely unusable input (caller keeps prior offset)", () => {
    expect(computeClockOffset([])).toBeNull()
    expect(
      computeClockOffset([
        { clientSendMonoMs: 100, clientRecvMonoMs: 50, serverNowMs: 1 },
      ]),
    ).toBeNull()
    // @ts-expect-error — exercising the runtime crash-guard on garbage input.
    expect(computeClockOffset(undefined)).toBeNull()
  })
})

// ── Integration: real socket.io server + client ─────────────────────────────
//
// We dynamically import socket.io + socket.io-client so the unit tests above
// run even if (in some constrained runner) the network stack is unavailable.

const INT_QUIZZ: Quizz = {
  subject: "Integration",
  questions: [
    {
      question: "Q1",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [1],
      cooldown: 1,
      time: 30,
    },
  ],
}

describe("real socket.io: answer ack + idempotency + clock pong", () => {
  // Lazily-resolved server bits; set up in beforeAll.
  let httpServer: import("node:http").Server
  let io: import("socket.io").Server
  let port: number
  // The server-side socket for the connected client (carries handshake auth).
  let serverSocketReady: Promise<import("socket.io").Socket>

  beforeAll(async () => {
    const { createServer } = await import("node:http")
    const { Server: IOServer } = await import("socket.io")

    httpServer = createServer()
    io = new IOServer(httpServer)

    // One round + one game, wired with the REAL RoundManager and a real Game
    // (for handleClockPing). enabled LL so acks + pongs are produced.
    const ll = enabledLL()

    let resolveServerSocket!: (s: import("socket.io").Socket) => void
    serverSocketReady = new Promise((r) => {
      resolveServerSocket = r
    })

    io.on("connection", (socket) => {
      // The RoundManager + a tiny clock-pong handler. We build the round with
      // the connected client present as a player (its clientId = "p1").
      const ctx = buildRound({
        quizz: INT_QUIZZ,
        players: [makePlayer("p1")],
        // RoundManager reads socket.handshake.auth.clientId on selectAnswer;
        // socket.io puts query/auth there. We set clientId via the client's
        // `auth` below, so the server-side handshake carries it.
        lowLatency: ll,
      })

      // Open the answer window (server-authoritative start + deadline).
      const start = Date.now()
      ;(
        ctx.round as unknown as {
          currentQuestion: number
          startTime: number
          serverSeq: number
          answerMeta: Map<string, unknown>
          seenMessageIds: Set<string>
          answerDeadlineAtServerMs: number
        }
      ).currentQuestion = 0
      ;(ctx.round as unknown as { startTime: number }).startTime = start
      ;(
        ctx.round as unknown as { answerDeadlineAtServerMs: number }
      ).answerDeadlineAtServerMs = start + 30_000

      socket.on(
        EVENTS.PLAYER.SELECTED_ANSWER,
        (payload: {
          data: { answerKey: number; clientMessageId?: string }
        }) => {
          // Drive the ACTUAL RoundManager over the wire.
          ctx.round.selectAnswer(
            socket as never,
            payload.data.answerKey,
            payload.data.clientMessageId,
          )
        },
      )

      socket.on(EVENTS.CLOCK.PING, (data: { clientSendMonoMs: number }) => {
        // Mirror Game.handleClockPing's contract exactly.
        socket.emit(EVENTS.CLOCK.PONG, {
          clientSendMonoMs: data.clientSendMonoMs,
          serverNowMs: Date.now(),
        })
      })

      resolveServerSocket(socket)
    })

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address()
        port = typeof addr === "object" && addr ? addr.port : 0
        resolve()
      })
    })
  })

  afterAll(async () => {
    io?.close()
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()))
  })

  const connectClient = async () => {
    const { io: clientIO } = await import("socket.io-client")
    const client = clientIO(`http://localhost:${port}`, {
      transports: ["websocket"],
      auth: { clientId: "p1" },
      reconnection: false,
      forceNew: true,
    })

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("connect timeout")), 4000)
      client.on("connect", () => {
        clearTimeout(t)
        resolve()
      })
      client.on("connect_error", (e) => {
        clearTimeout(t)
        reject(e)
      })
    })

    return client
  }

  it("acks the first answer ok, then dedups a re-send as duplicate", async () => {
    const client = await connectClient()
    await serverSocketReady // Ensure the server wired its handlers

    const waitAck = (predicate: (a: AnswerAck) => boolean) =>
      new Promise<AnswerAck>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("ack timeout")), 4000)
        const onAck = (ack: AnswerAck) => {
          if (predicate(ack)) {
            clearTimeout(t)
            client.off(EVENTS.PLAYER.ANSWER_ACK, onAck)
            resolve(ack)
          }
        }
        client.on(EVENTS.PLAYER.ANSWER_ACK, onAck)
      })

    const firstOk = waitAck((a) => a.accepted)
    client.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId: "g",
      data: { answerKey: 1, clientMessageId: "tap-1" },
    })
    const ok = await firstOk
    expect(ok.accepted).toBe(true)
    expect(ok.reason).toBe("ok")

    // Re-send the SAME tap (same clientMessageId) → server is idempotent.
    const dupP = waitAck((a) => !a.accepted)
    client.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId: "g",
      data: { answerKey: 1, clientMessageId: "tap-1" },
    })
    const dup = await dupP
    expect(dup.accepted).toBe(false)
    expect(dup.reason).toBe("duplicate")

    client.disconnect()
  })

  it("answers a clock:ping with a clock:pong echoing the client mono ts", async () => {
    const client = await connectClient()
    const sent = 123_456.789

    const pong = await new Promise<{
      clientSendMonoMs: number
      serverNowMs: number
    }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("pong timeout")), 4000)
      client.on(EVENTS.CLOCK.PONG, (p) => {
        clearTimeout(t)
        resolve(p)
      })
      client.emit(EVENTS.CLOCK.PING, { clientSendMonoMs: sent })
    })

    expect(pong.clientSendMonoMs).toBe(sent)
    expect(typeof pong.serverNowMs).toBe("number")
    expect(Number.isFinite(pong.serverNowMs)).toBe(true)

    client.disconnect()
  })
})
