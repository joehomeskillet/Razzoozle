import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Real-port integration test for the solo-play HTTP edge. Binds a node http
// server that wires the route dispatcher exactly like index.ts / the existing
// http-integration.test.ts harness, then exercises the solo handlers in
// http-routes.ts (handleCheckAnswer / handleSoloScore) with fetch. Body shape is
// always asserted (a bare 200 is not a pass). The quiz is seeded on disk via
// CONFIG_PATH exactly like no-solution-leak.test.ts (config.ts captures
// CONFIG_PATH at module-load, so it MUST be set before the dynamic import).
//
// Wave-A guards reflected: handleSoloScore now runs a getQuizzById existence
// check before persisting (unknown id -> 404), and every solo handler is gated
// by a module-global checkGlobalSoloRate (120 calls / 60 s server-wide). This
// file keeps its total solo HTTP calls well under that ceiling.

let tmp: string

// Valid quiz mirroring the no-solution-leak fixture shape: a choice question
// (solutions) is enough to exercise the correct-answer / bounds paths.
const QUIZ = {
  subject: "Solo Endpoints Test",
  questions: [
    {
      question: "Pick the good answer",
      answers: ["No", "Good answer", "No", "No"],
      solutions: [1],
      cooldown: 5,
      time: 15,
    },
  ],
}

const startServer = async (): Promise<{ server: Server; base: string }> => {
  // Re-import after CONFIG_PATH is set (config.ts reads it at module-load); the
  // resetModules in startServer's caller keeps the module graph fresh per case.
  const { dispatchHttp } = await import(
    "@razzoozle/socket/services/http-routes"
  )
  const server = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("ok")
      return
    }
    if (dispatchHttp(req, res)) {
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return { server, base: `http://127.0.0.1:${port}` }
}

const post = (base: string, path: string, body: unknown, headers = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solo-cfg-"))
  fs.mkdirSync(path.join(tmp, "quizz"), { recursive: true })
  fs.writeFileSync(
    path.join(tmp, "quizz", "solotest.json"),
    JSON.stringify(QUIZ),
  )
  process.env.CONFIG_PATH = tmp
})

afterAll(() => {
  delete process.env.CONFIG_PATH
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("solo HTTP endpoints (real port)", () => {
  let server: Server
  let base: string

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it("check-answer: correct choice answer → correct:true + points round(1000*base)", async () => {
    vi.resetModules()
    ;({ server, base } = await startServer())
    const res = await post(base, "/api/quizz/solotest/check-answer", {
      questionIndex: 0,
      answerId: 1, // solutions: [1] → correct, base 1 → 1000 points
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { correct: boolean; points: number }
    expect(body.correct).toBe(true)
    expect(body.points).toBe(1000)
  })

  it("check-answer: out-of-range questionIndex → 400 (bounds guard)", async () => {
    vi.resetModules()
    ;({ server, base } = await startServer())
    const res = await post(base, "/api/quizz/solotest/check-answer", {
      questionIndex: 99, // beyond quiz.questions.length
      answerId: 0,
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(typeof body.error).toBe("string")
  })

  it("solo-score: unknown quiz id → 404 (Wave-A getQuizzById existence guard)", async () => {
    vi.resetModules()
    ;({ server, base } = await startServer())
    const res = await post(base, "/api/quizz/doesnotexist/solo-score", {
      playerName: "Nobody",
      score: 500,
    })
    expect(res.status).toBe(404)
  })

  it("solo-score: known quiz persists and returns a desc-sorted leaderboard", async () => {
    vi.resetModules()
    ;({ server, base } = await startServer())

    // Two submissions with out-of-order scores; the response leaderboard must be
    // sorted descending by score.
    const first = await post(base, "/api/quizz/solotest/solo-score", {
      playerName: "Alice",
      score: 300,
    })
    expect(first.status).toBe(200)

    const second = await post(base, "/api/quizz/solotest/solo-score", {
      playerName: "Bob",
      score: 900,
    })
    expect(second.status).toBe(200)
    const body = (await second.json()) as {
      leaderboard: { playerName: string; score: number }[]
    }
    expect(Array.isArray(body.leaderboard)).toBe(true)
    expect(body.leaderboard.length).toBe(2)
    // Highest score first.
    expect(body.leaderboard[0]!.playerName).toBe("Bob")
    expect(body.leaderboard[0]!.score).toBe(900)
    expect(body.leaderboard[1]!.playerName).toBe("Alice")
    // Strictly descending.
    expect(body.leaderboard[0]!.score).toBeGreaterThanOrEqual(
      body.leaderboard[1]!.score,
    )
  })
})
