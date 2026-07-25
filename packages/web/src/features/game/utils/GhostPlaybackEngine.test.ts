import { describe, expect, it } from "vitest"
import { GhostPlaybackEngine, type GhostPlayerRecord } from "./GhostPlaybackEngine"

describe("GhostPlaybackEngine (Issue #472 / SDD #472)", () => {
  const sampleGhosts: GhostPlayerRecord[] = [
    {
      username: "GhostMaster",
      answers: [
        { questionIndex: 0, answer: 1, timeMs: 2000, pointsEarned: 950 },
        { questionIndex: 1, answer: 0, timeMs: 3500, pointsEarned: 880 },
      ],
    },
    {
      username: "ProReplayer",
      answers: [
        { questionIndex: 0, answer: 1, timeMs: 5000, pointsEarned: 700 },
        { questionIndex: 1, answer: 1, timeMs: 1200, pointsEarned: 990 },
      ],
    },
  ]

  it("initializes with ghost records", () => {
    const engine = new GhostPlaybackEngine(sampleGhosts)
    expect(engine.getGhostCount()).toBe(2)
  })

  it("returns zero score before any ghost has answered in question 0", () => {
    const engine = new GhostPlaybackEngine(sampleGhosts)
    engine.setQuestionIndex(0)

    const snapshot = engine.getSnapshotAtTime(1000)
    expect(snapshot[0].totalPoints).toBe(0)
    expect(snapshot[0].hasAnsweredCurrent).toBe(false)
  })

  it("awards points to GhostMaster after timeMs threshold is reached", () => {
    const engine = new GhostPlaybackEngine(sampleGhosts)
    engine.setQuestionIndex(0)

    const snapshot = engine.getSnapshotAtTime(2500)
    expect(snapshot[0].totalPoints).toBe(950)
    expect(snapshot[0].hasAnsweredCurrent).toBe(true)
    expect(snapshot[1].totalPoints).toBe(0)
    expect(snapshot[1].hasAnsweredCurrent).toBe(false)
  })

  it("carries over points from previous questions correctly", () => {
    const engine = new GhostPlaybackEngine(sampleGhosts)
    engine.setQuestionIndex(1)

    // Elapsed 1000ms in Q1: previous Q0 points should be included
    const snapshot = engine.getSnapshotAtTime(1000)
    expect(snapshot[0].totalPoints).toBe(950)
    expect(snapshot[1].totalPoints).toBe(700)
  })

  it("accumulates points when ghost answers in current question", () => {
    const engine = new GhostPlaybackEngine(sampleGhosts)
    engine.setQuestionIndex(1)

    const snapshot = engine.getSnapshotAtTime(4000)
    expect(snapshot[0].totalPoints).toBe(950 + 880)
    expect(snapshot[0].hasAnsweredCurrent).toBe(true)
  })

  it("exports GhostPlaybackEngine class matching SDD #472 specification", () => {
    expect(typeof GhostPlaybackEngine).toBe("function")
  })
})
