/**
 * Flow 1: Manager creates room, player joins
 *
 * Sequence:
 * 1. Manager connects and authenticates
 * 2. Manager creates a game with the fixture quiz
 * 3. Manager receives the invitation code
 * 4. Player connects
 * 5. Player joins with the invite code
 * 6. Player logs in with username and avatar
 * 7. Manager receives new-player notification
 */

import { FrameRecorder } from "./frame-recorder.ts"
import { v4 as uuid } from "uuid"

export async function runFlow1(
  outputDir: string,
  serverUrl: string,
  quizzId: string
): Promise<{ gameId: string; inviteCode: string }> {
  console.log("\n=== FLOW 1: Manager Create + Player Join ===\n")

  const managerRecorder = new FrameRecorder(`${outputDir}/flow1-manager.json`, serverUrl)
  const managerId = uuid()
  let gameId = ""
  let inviteCode = ""

  try {
    // Manager connects and authenticates
    const managerSocket = await managerRecorder.connect(managerId)
    console.log("[Manager] Connected, authenticating...")

    // Authenticate as manager
    await managerRecorder.emit("manager:auth", "TESTPASS123")

    // Wait for auth response
    await new Promise((resolve) => setTimeout(resolve, 500))

    console.log("[Manager] Authenticated, creating game...")

    // Create game with the quiz
    const createResponse = await managerRecorder.emit("game:create", quizzId, "manager:gameCreated", 3000)

    // Wait a bit to ensure the event is captured
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Extract game details from the last frames
    const rawFrames = managerRecorder.getRawFrames()
    const gameCreatedFrame = rawFrames.find((f) => f.event === "manager:gameCreated" && f.direction === "receive")
    if (gameCreatedFrame && typeof gameCreatedFrame.data === "object" && gameCreatedFrame.data !== null) {
      const data = gameCreatedFrame.data as Record<string, unknown>
      gameId = String(data.gameId || "")
      inviteCode = String(data.inviteCode || "")
    }

    console.log(`[Manager] Game created: gameId=${gameId}, inviteCode=${inviteCode}`)

    // Keep manager connected while player joins
    console.log("[Manager] Waiting for player to join...")
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Capture the new player event from the manager's perspective
    await new Promise((resolve) => setTimeout(resolve, 1000))
  } catch (error) {
    console.error("[Manager] Error:", error)
  } finally {
    await managerRecorder.disconnect()
    managerRecorder.save()
  }

  // Player flow - happens while manager is still connected
  const playerRecorder = new FrameRecorder(`${outputDir}/flow1-player.json`, serverUrl)
  const playerId = uuid()

  try {
    const playerSocket = await playerRecorder.connect(playerId)
    console.log("[Player] Connected")

    // Join with the invite code
    console.log(`[Player] Joining with invite code: ${inviteCode}`)
    await playerRecorder.emit("player:join", inviteCode, "game:successRoom", 3000)

    // Wait for join response
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Log in with username and avatar
    console.log("[Player] Logging in...")
    await playerRecorder.emit(
      "player:login",
      {
        gameId,
        data: {
          username: "Test Player",
          avatar: "avatar-1",
        },
      },
      "game:status",
      3000
    )

    // Wait for all events to be captured
    await new Promise((resolve) => setTimeout(resolve, 1000))

    await playerRecorder.disconnect()
  } catch (error) {
    console.error("[Player] Error:", error)
  } finally {
    playerRecorder.save()
  }

  return { gameId, inviteCode }
}
