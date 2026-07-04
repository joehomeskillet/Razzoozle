/**
 * Continuous golden-frames session
 *
 * Records one manager + one player session through all three phases:
 * 1. Manager creates room, player joins
 * 2. Manager starts game, player answers
 * 3. Manager reveals/shows leaderboard
 *
 * Then splits the continuous recording into 6 output files by phase.
 */

import fs from "fs"
import path from "path"
import { FrameRecorder } from "./frame-recorder.ts"
import { v4 as uuid } from "uuid"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface PhaseMarker {
  name: string
  startIdx: number
  endIdx: number
}

async function runContinuousSession(
  outputDir: string,
  serverUrl: string,
  quizzId: string
): Promise<void> {
  console.log("\n========================================")
  console.log("Golden-Frame Continuous Session")
  console.log("========================================\n")

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const managerRecorder = new FrameRecorder(
    path.join(outputDir, ".manager-temp.json"),
    serverUrl
  )
  const playerRecorder = new FrameRecorder(path.join(outputDir, ".player-temp.json"), serverUrl)

  const managerId = uuid()
  const playerId = uuid()
  let gameId = ""
  let inviteCode = ""

  const managerPhases: PhaseMarker[] = []
  const playerPhases: PhaseMarker[] = []

  try {
    // === PHASE 1: Manager creates room, player joins ===
    console.log("=== PHASE 1: Create Room + Player Join ===\n")

    const managerStartIdx = managerRecorder.getFrameCount()
    const playerStartIdx = playerRecorder.getFrameCount()

    const managerSocket = await managerRecorder.connect(managerId)
    console.log("[Manager] Connected, authenticating...")

    await managerRecorder.emit("manager:auth", "TESTPASS123")
    await new Promise((resolve) => setTimeout(resolve, 500))
    console.log("[Manager] Authenticated, creating game...")

    await managerRecorder.emit("game:create", quizzId, "manager:gameCreated", 3000)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const rawManagerFrames = managerRecorder.getRawFrames()
    const gameCreatedFrame = rawManagerFrames.find(
      (f) => f.event === "manager:gameCreated" && f.direction === "receive"
    )
    if (gameCreatedFrame && typeof gameCreatedFrame.data === "object" && gameCreatedFrame.data !== null) {
      const data = gameCreatedFrame.data as Record<string, unknown>
      gameId = String(data.gameId || "")
      inviteCode = String(data.inviteCode || "")
    }
    console.log(`[Manager] Game created: gameId=${gameId}, inviteCode=${inviteCode}`)

    const playerSocket = await playerRecorder.connect(playerId)
    console.log("[Player] Connected")

    await playerRecorder.emit("player:join", inviteCode, "game:successRoom", 3000)
    await new Promise((resolve) => setTimeout(resolve, 500))
    console.log("[Player] Joined room")

    await playerRecorder.emit(
      "player:login",
      {
        gameId,
        data: {
          username: "Test Player",
        },
      },
      "game:status",
      3000
    )
    await new Promise((resolve) => setTimeout(resolve, 3000))

    managerPhases.push({
      name: "flow1",
      startIdx: managerStartIdx,
      endIdx: managerRecorder.getFrameCount(),
    })
    playerPhases.push({
      name: "flow1",
      startIdx: playerStartIdx,
      endIdx: playerRecorder.getFrameCount(),
    })

    console.log("[Manager] Phase 1 complete")
    console.log("[Player] Phase 1 complete\n")

    // === PHASE 2: Manager starts game, player answers ===
    console.log("=== PHASE 2: Question Round + Answer ===\n")

    const managerPhase2Start = managerRecorder.getFrameCount()
    const playerPhase2Start = playerRecorder.getFrameCount()

    console.log("[Manager] Starting game...")
    await managerRecorder.emit("manager:startGame", { gameId }, undefined, 3000)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    console.log("[Player] Submitting answer...")
    await playerRecorder.emit(
      "player:selectedAnswer",
      {
        gameId,
        data: {
          answerKey: 1,
        },
      },
      undefined,
      2000
    )
    await new Promise((resolve) => setTimeout(resolve, 2000))

    console.log("[Manager] Revealing answer...")
    await managerRecorder.emit("manager:revealAnswer", { gameId }, undefined, 3000)
    await new Promise((resolve) => setTimeout(resolve, 3000))

    managerPhases.push({
      name: "flow2",
      startIdx: managerPhase2Start,
      endIdx: managerRecorder.getFrameCount(),
    })
    playerPhases.push({
      name: "flow2",
      startIdx: playerPhase2Start,
      endIdx: playerRecorder.getFrameCount(),
    })

    console.log("[Manager] Phase 2 complete")
    console.log("[Player] Phase 2 complete\n")

    // === PHASE 3: Manager shows leaderboard ===
    console.log("=== PHASE 3: Leaderboard ===\n")

    const managerPhase3Start = managerRecorder.getFrameCount()
    const playerPhase3Start = playerRecorder.getFrameCount()

    console.log("[Manager] Showing leaderboard...")
    
    await managerRecorder.emit("manager:showLeaderboard", { gameId }, undefined, 3000)
    await new Promise((resolve) => setTimeout(resolve, 5000))

    managerPhases.push({
      name: "flow3",
      startIdx: managerPhase3Start,
      endIdx: managerRecorder.getFrameCount(),
    })
    playerPhases.push({
      name: "flow3",
      startIdx: playerPhase3Start,
      endIdx: playerRecorder.getFrameCount(),
    })

    console.log("[Manager] Phase 3 complete")
    console.log("[Player] Phase 3 complete\n")

    // Disconnect after recording all phases
    await managerRecorder.disconnect()
    await playerRecorder.disconnect()
  } catch (error) {
    console.error("Session error:", error)
    throw error
  }

  // Save continuous recordings to temp files
  managerRecorder.save()
  playerRecorder.save()

  // Split the recordings by phase
  await splitRecordings(outputDir, managerPhases, playerPhases)

  // Clean up temp files
  fs.unlinkSync(path.join(outputDir, ".manager-temp.json"))
  fs.unlinkSync(path.join(outputDir, ".player-temp.json"))

  console.log("========================================")
  console.log("Golden-frame recording complete!")
  console.log("========================================")

  const outputFiles = fs
    .readdirSync(outputDir)
    .filter((f) => f.startsWith("flow") && f.endsWith(".json"))
  console.log("\nGenerated files:")
  outputFiles.sort().forEach((file) => {
    const filePath = path.join(outputDir, file)
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    console.log(`  ✓ ${file}: ${content.frameCount} frames`)
  })
  console.log("\n========================================")
}

async function splitRecordings(
  outputDir: string,
  managerPhases: PhaseMarker[],
  playerPhases: PhaseMarker[]
): Promise<void> {
  const tempManagerPath = path.join(outputDir, ".manager-temp.json")
  const tempPlayerPath = path.join(outputDir, ".player-temp.json")

  const managerData = JSON.parse(fs.readFileSync(tempManagerPath, "utf-8"))
  const playerData = JSON.parse(fs.readFileSync(tempPlayerPath, "utf-8"))

  for (const phase of managerPhases) {
    const phaseFrames = managerData.frames.slice(phase.startIdx, phase.endIdx)
    const output = {
      recordedAt: new Date().toISOString(),
      frameCount: phaseFrames.length,
      frames: phaseFrames,
    }
    const outputPath = path.join(outputDir, `${phase.name}-manager.json`)
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  }

  for (const phase of playerPhases) {
    const phaseFrames = playerData.frames.slice(phase.startIdx, phase.endIdx)
    const output = {
      recordedAt: new Date().toISOString(),
      frameCount: phaseFrames.length,
      frames: phaseFrames,
    }
    const outputPath = path.join(outputDir, `${phase.name}-player.json`)
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  }
}

async function main() {
  const args = process.argv.slice(2)
  const serverUrl = args[args.indexOf("--server-url") + 1] || "http://localhost:3310"
  const outputDir = args[args.indexOf("--output-dir") + 1] || path.join(__dirname, "output")
  const quizzId = "example"

  try {
    await runContinuousSession(outputDir, serverUrl, quizzId)
  } catch (error) {
    console.error("Error:", error)
    process.exit(1)
  }
}

main()
