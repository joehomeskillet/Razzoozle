/**
 * Flow 3: Result/Reveal + Leaderboard
 *
 * Sequence:
 * 1. Game has completed the question round
 * 2. Manager shows the leaderboard
 * 3. Players see leaderboard with their scores
 * 4. Manager ends the game or continues to next question
 */

import { FrameRecorder } from "./frame-recorder.ts"
import { v4 as uuid } from "uuid"

export async function runFlow3(outputDir: string, serverUrl: string, gameId: string): Promise<void> {
  console.log("\n=== FLOW 3: Result/Reveal + Leaderboard ===\n")

  const managerRecorder = new FrameRecorder(`${outputDir}/flow3-manager.json`, serverUrl)
  const managerId = uuid()

  try {
    const managerSocket = await managerRecorder.connect(managerId)
    console.log("[Manager] Connected, authenticating...")

    // Authenticate
    await managerRecorder.emit("manager:auth", "TESTPASS123", undefined, 2000)
    await new Promise((resolve) => setTimeout(resolve, 300))

    console.log("[Manager] Showing leaderboard...")

    // Show leaderboard
    await managerRecorder.emit("manager:showLeaderboard", { gameId }, undefined, 3000)

    // Wait for leaderboard to be shown
    await new Promise((resolve) => setTimeout(resolve, 1000))

    console.log("[Manager] Leaderboard displayed, waiting...")

    // Keep connection open to capture leaderboard state
    await new Promise((resolve) => setTimeout(resolve, 2000))

    await managerRecorder.disconnect()
  } catch (error) {
    console.error("[Manager] Error:", error)
  } finally {
    managerRecorder.save()
  }

  // Player flow
  const playerRecorder = new FrameRecorder(`${outputDir}/flow3-player.json`, serverUrl)
  const playerId = uuid()

  try {
    const playerSocket = await playerRecorder.connect(playerId)
    console.log("[Player] Connected, waiting for leaderboard...")

    // Wait for leaderboard to be shown
    await new Promise((resolve) => setTimeout(resolve, 2000))

    console.log("[Player] Viewing leaderboard...")

    // Wait to capture leaderboard data and any updates
    await new Promise((resolve) => setTimeout(resolve, 2000))

    await playerRecorder.disconnect()
  } catch (error) {
    console.error("[Player] Error:", error)
  } finally {
    playerRecorder.save()
  }
}
