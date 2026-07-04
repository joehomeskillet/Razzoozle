/**
 * Record Rust spike server flow1
 *
 * Rust spike implements: connect + game:create + manager:gameCreated + player:join + game:successRoom + player:login + game:successJoin + manager:newPlayer + game:totalPlayers
 * (NO manager:auth, NO game:status, NO cooldowns)
 */

import fs from "fs"
import path from "path"
import { io, Socket } from "socket.io-client"
import { v4 as uuid } from "uuid"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

class SimpleRecorder {
  private frames: any[] = []
  private socket: Socket | null = null
  private outputPath: string

  constructor(outputPath: string) {
    this.outputPath = outputPath
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  async connect(serverUrl: string, clientId?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const auth = clientId ? { clientId } : {}
      this.socket = io(serverUrl, {
        auth,
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionDelayMax: 200,
        reconnectionAttempts: 10,
      })

      const originalEmit = this.socket.emit.bind(this.socket)
      this.socket.emit = ((event: string, ...args: any[]) => {
        this.frames.push({
          timestamp: Date.now(),
          direction: "send",
          event,
          data: args.length === 1 ? args[0] : args,
        })
        return originalEmit(event, ...args)
      }) as any

      this.socket.on("connect", () => {
        console.log(`[Recorder] Connected to ${serverUrl}`)
        resolve(this.socket!)
      })

      this.socket.onAny((event: string, ...args: any[]) => {
        if (!event.startsWith("__")) {
          this.frames.push({
            timestamp: Date.now(),
            direction: "receive",
            event,
            data: args.length === 1 ? args[0] : args,
          })
        }
      })

      this.socket.on("connect_error", (error) => {
        console.error(`[Recorder] Connection error:`, error)
        reject(error)
      })

      setTimeout(() => {
        reject(new Error("Connection timeout"))
      }, 5000)
    })
  }

  async emit(event: string, data?: any, waitFor?: string, timeout = 5000): Promise<any> {
    if (!this.socket) throw new Error("Socket not connected")
    return new Promise((resolve) => {
      if (waitFor) {
        const timer = setTimeout(() => {
          this.socket!.off(waitFor, handler)
          resolve(null)
        }, timeout)
        const handler = (data: any) => {
          clearTimeout(timer)
          this.socket!.off(waitFor, handler)
          resolve(data)
        }
        this.socket.on(waitFor, handler)
      }
      this.socket.emit(event, data)
      if (!waitFor) {
        setTimeout(() => resolve(null), 100)
      }
    })
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      return new Promise((resolve) => {
        this.socket!.disconnect()
        setTimeout(() => resolve(), 500)
      })
    }
  }

  save(): void {
    const normalized = this.frames.map((frame) => ({
      direction: frame.direction,
      event: frame.event,
      data: frame.data,
    }))
    const output = {
      recordedAt: new Date().toISOString(),
      frameCount: normalized.length,
      frames: normalized,
    }
    fs.writeFileSync(this.outputPath, JSON.stringify(output, null, 2))
    console.log(`[Recorder] Saved ${normalized.length} frames to ${this.outputPath}`)
  }

  getRawFrames(): any[] {
    return [...this.frames]
  }

  getFrameCount(): number {
    return this.frames.length
  }
}

async function recordRustFlow1(
  outputDir: string,
  serverUrl: string,
  quizzId: string
): Promise<void> {
  console.log("\n========================================")
  console.log("Rust Spike Flow1 Recording")
  console.log("========================================\n")

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const managerRecorder = new SimpleRecorder(path.join(outputDir, "flow1-manager.json"))
  const playerRecorder = new SimpleRecorder(path.join(outputDir, "flow1-player.json"))

  const managerId = uuid()
  const playerId = uuid()
  let gameId = ""
  let inviteCode = ""

  try {
    const managerSocket = await managerRecorder.connect(serverUrl, managerId)
    console.log("[Manager] Connected")

    console.log("[Manager] Creating game...")
    await managerRecorder.emit("game:create", quizzId, "manager:gameCreated", 3000)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const rawManagerFrames = managerRecorder.getRawFrames()
    const gameCreatedFrame = rawManagerFrames.find(
      (f) => f.event === "manager:gameCreated" && f.direction === "receive"
    )
    if (gameCreatedFrame && typeof gameCreatedFrame.data === "object" && gameCreatedFrame.data !== null) {
      const data = gameCreatedFrame.data as any
      gameId = String(data.gameId || "")
      inviteCode = String(data.inviteCode || "")
    }
    console.log(`[Manager] Game created: gameId=${gameId}, inviteCode=${inviteCode}`)

    const playerSocket = await playerRecorder.connect(serverUrl, playerId)
    console.log("[Player] Connected")

    console.log(`[Player] Joining with invite code: ${inviteCode}`)
    await playerRecorder.emit("player:join", inviteCode, "game:successRoom", 3000)
    await new Promise((resolve) => setTimeout(resolve, 500))
    console.log("[Player] Joined")

    console.log("[Player] Logging in...")
    await playerRecorder.emit(
      "player:login",
      {
        gameId,
        data: {
          username: "Test Player",
        },
      },
      "game:successJoin",
      3000
    )
    await new Promise((resolve) => setTimeout(resolve, 1000))

    await new Promise((resolve) => setTimeout(resolve, 2000))

    await managerRecorder.disconnect()
    await playerRecorder.disconnect()

    console.log("\nRecording complete!")
    console.log(`Manager frames: ${managerRecorder.getFrameCount()}`)
    console.log(`Player frames: ${playerRecorder.getFrameCount()}`)
  } catch (error) {
    console.error("Recording error:", error)
    throw error
  }

  managerRecorder.save()
  playerRecorder.save()

  console.log("\n========================================")
  console.log("Rust flow1 recording saved!")
  console.log("========================================\n")
}

async function main() {
  const args = process.argv.slice(2)
  const serverUrl = args[args.indexOf("--server-url") + 1] || "http://localhost:3311"
  const outputDir = args[args.indexOf("--output-dir") + 1] || path.join(__dirname, "output-rust")
  const quizzId = "example"

  try {
    await recordRustFlow1(outputDir, serverUrl, quizzId)
  } catch (error) {
    console.error("Error:", error)
    process.exit(1)
  }
}

main()
