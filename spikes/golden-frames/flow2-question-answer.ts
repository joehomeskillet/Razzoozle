/**
 * Flow 2: Full question round with one answer submission
 *
 * Sequence:
 * 1. Manager starts the game (continues from flow 1)
 * 2. Players see the question (game:updateQuestion)
 * 3. Player submits an answer (player:selectedAnswer)
 * 4. Manager reveals the answer (manager:revealAnswer)
 * 5. Result is shown to player
 */

import { FrameRecorder } from "./frame-recorder.ts"
import { v4 as uuid } from "uuid"

export async function runFlow2(
  outputDir: string,
  serverUrl: string,
  gameId: string
): Promise<void> {
  console.log("\n=== FLOW 2: Question Round with Answer Submission ===\n")

  const managerRecorder = new FrameRecorder(`${outputDir}/flow2-manager.json`, serverUrl)
  const managerId = uuid()

  try {
    const managerSocket = await managerRecorder.connect(managerId)
    console.log("[Manager] Connected, authenticating...")

    // Authenticate
    await managerRecorder.emit("manager:auth", "TESTPASS123", undefined, 2000)
    await new Promise((resolve) => setTimeout(resolve, 300))

    console.log("[Manager] Starting game...")
    await managerRecorder.emit("manager:startGame", { gameId }, undefined, 3000)

    // Wait for question to be shown
    await new Promise((resolve) => setTimeout(resolve, 1000))

    console.log("[Manager] Waiting for player answer...")
    await new Promise((resolve) => setTimeout(resolve, 4000))

    // Reveal the answer
    console.log("[Manager] Revealing answer...")
    await managerRecorder.emit("manager:revealAnswer", { gameId }, undefined, 3000)

    await new Promise((resolve) => setTimeout(resolve, 1000))

    await managerRecorder.disconnect()
  } catch (error) {
    console.error("[Manager] Error:", error)
  } finally {
    managerRecorder.save()
  }

  // Player flow
  const playerRecorder = new FrameRecorder(`${outputDir}/flow2-player.json`, serverUrl)
  const playerId = uuid()

  try {
    const playerSocket = await playerRecorder.connect(playerId)
    console.log("[Player] Connected")

    // In real scenario, the player would already be in the game from flow 1
    // We'll simulate being in an existing game by just listening for events

    // Wait for question to be shown (~1s after manager starts game)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    console.log("[Player] Submitting answer to question 1...")

    // Submit answer to the first question (answer index 1 = "4", which is correct)
    await playerRecorder.emit(
      "player:selectedAnswer",
      {
        gameId,
        data: {
          answerKey: 1, // Correct answer (index 1 = "4")
        },
      },
      undefined,
      2000
    )

    // Wait for answer confirmation and reveal
    await new Promise((resolve) => setTimeout(resolve, 5000))

    await playerRecorder.disconnect()
  } catch (error) {
    console.error("[Player] Error:", error)
  } finally {
    playerRecorder.save()
  }
}
