import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

// Assignment system integration tests
const startServer = async (): Promise<{ server: Server; base: string }> => {
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

describe("Assignment system (integration)", () => {
  let server: Server
  let base: string

  beforeEach(async () => {
    vi.resetModules()
    process.env.RAZZOOLE_DEV = "1"
    ;({ server, base } = await startServer())
  })

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it("GET /api/assignment/:id retrieves assignment metadata (public)", async () => {
    // Create an assignment directly via saveAssignment
    const { saveQuizz, saveAssignment } = await import("@razzoozle/socket/services/config")
    const { EXAMPLE_QUIZZ } = await import("@razzoozle/common/constants")
    const quizzResp = await saveQuizz(EXAMPLE_QUIZZ)
    const quizzId = quizzResp.id

    const assignmentId = "test-assignment-" + Date.now()
    saveAssignment({
      id: assignmentId,
      quizzId,
      createdAt: Date.now(),
      deadline: Date.now() + 3600000,
    })

    // Get assignment (GET) — public read
    const getRes = await fetch(`${base}/api/assignment/${assignmentId}`)
    expect(getRes.status).toBe(200)
    const assignment = (await getRes.json()) as { id?: string; quizzId?: string }
    expect(assignment.id).toBe(assignmentId)
    expect(assignment.quizzId).toBe(quizzId)
  })

  it("POST solo-score with expired assignment deadline → 403", async () => {
    // Create an assignment with deadline in the PAST
    const { saveQuizz, saveAssignment } = await import("@razzoozle/socket/services/config")
    const { EXAMPLE_QUIZZ } = await import("@razzoozle/common/constants")
    const quizzResp = await saveQuizz(EXAMPLE_QUIZZ)
    const quizzId = quizzResp.id

    const pastDeadline = Date.now() - 1000
    const assignmentId = "expired-assignment-" + Date.now()

    saveAssignment({
      id: assignmentId,
      quizzId,
      createdAt: Date.now() - 7200000,
      deadline: pastDeadline,
    })

    // Try to submit a score with the expired assignment
    const scoreRes = await post(base, `/api/quizz/${quizzId}/solo-score`, {
      playerName: "Test Player",
      score: 500,
      assignmentId,
    })

    expect(scoreRes.status).toBe(403)
    const errorBody = (await scoreRes.json()) as { error?: string }
    expect(errorBody.error).toBe("assignment_closed")
  })

  it("POST solo-score with valid assignmentId → appears in /api/assignment/:id/results", async () => {
    // Create an assignment with future deadline
    const { saveQuizz, saveAssignment } = await import("@razzoozle/socket/services/config")
    const { EXAMPLE_QUIZZ } = await import("@razzoozle/common/constants")
    const quizzResp = await saveQuizz(EXAMPLE_QUIZZ)
    const quizzId = quizzResp.id

    const futureDeadline = Date.now() + 7200000
    const assignmentId = "valid-assignment-" + Date.now()

    saveAssignment({
      id: assignmentId,
      quizzId,
      createdAt: Date.now(),
      deadline: futureDeadline,
    })

    // Submit a score with the assignment
    const scoreRes = await post(base, `/api/quizz/${quizzId}/solo-score`, {
      playerName: "Alice",
      score: 750,
      assignmentId,
    })

    expect(scoreRes.status).toBe(200)

    // Verify the score was saved with assignmentId
    const { getSoloResults } = await import("@razzoozle/socket/services/config")
    const results = getSoloResults(quizzId)
    const match = results.find((r) => r.playerName === "Alice")
    expect(match?.score).toBe(750)
    expect(match?.assignmentId).toBe(assignmentId)
  })
})
