// Unit tests for useSoloStore's finishGame() body shape (#471). The server
// reads assignmentId from the JSON body only (SoloScoreRequest in
// rust/server/src/http/solo.rs has no Query extractor), so the request must
// carry it there — a query-string param is silently dropped and the score
// lands unlinked to its assignment. Stub the global fetch (vi.stubGlobal) per
// case, same pattern as features/theme/apply.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest"
import { useSoloStore } from "./solo"

afterEach(() => {
  vi.unstubAllGlobals()
  useSoloStore.setState({
    assignmentId: undefined,
    playerName: "",
    totalPoints: 0,
    answers: [],
    submitError: null,
  })
})

describe("useSoloStore.finishGame", () => {
  it("includes assignmentId in the request body when one is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal("fetch", fetchMock)

    useSoloStore.setState({
      assignmentId: "assign-123",
      playerName: "Alex",
      totalPoints: 40,
      answers: [],
    })

    await useSoloStore.getState().finishGame("quizz-1")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    // Query-less: the server never reads a query param, so it must not be sent.
    expect(url).toBe("/api/quizz/quizz-1/solo-score")
    const body = JSON.parse(init.body as string) as { assignmentId?: string }
    expect(body.assignmentId).toBe("assign-123")
  })

  it("omits assignmentId from the request body when none is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal("fetch", fetchMock)

    useSoloStore.setState({
      assignmentId: undefined,
      playerName: "Alex",
      totalPoints: 40,
      answers: [],
    })

    await useSoloStore.getState().finishGame("quizz-1")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect("assignmentId" in body).toBe(false)
  })

  it("sets a rejected submitError with reason deadline when the server responds 403 with a deadline message, and does not touch the leaderboard as if it succeeded", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Assignment deadline has passed",
    })
    vi.stubGlobal("fetch", fetchMock)

    useSoloStore.setState({
      assignmentId: "assign-123",
      playerName: "Alex",
      totalPoints: 40,
      answers: [],
    })

    await useSoloStore.getState().finishGame("quizz-1")

    expect(useSoloStore.getState().submitError).toEqual({
      kind: "rejected",
      reason: "deadline",
    })
    expect(useSoloStore.getState().leaderboard).toEqual([])
  })

  it("sets a rejected submitError with reason attemptLimit when the server responds 403 with an attempt-limit message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Maximum number of attempts reached",
    })
    vi.stubGlobal("fetch", fetchMock)

    useSoloStore.setState({
      assignmentId: "assign-123",
      playerName: "Alex",
      totalPoints: 40,
      answers: [],
    })

    await useSoloStore.getState().finishGame("quizz-1")

    expect(useSoloStore.getState().submitError).toEqual({
      kind: "rejected",
      reason: "attemptLimit",
    })
  })

  it("sets a network submitError when the request throws, distinct from a server rejection", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"))
    vi.stubGlobal("fetch", fetchMock)

    useSoloStore.setState({
      assignmentId: "assign-123",
      playerName: "Alex",
      totalPoints: 40,
      answers: [],
    })

    await useSoloStore.getState().finishGame("quizz-1")

    expect(useSoloStore.getState().submitError).toEqual({ kind: "network" })
  })
})
