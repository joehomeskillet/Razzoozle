import fs from "fs"
import path from "path"
import { io, Socket } from "socket.io-client"

interface FrameLog {
  timestamp: number
  direction: "send" | "receive"
  event: string
  data: unknown
}

interface NormalizedFrame {
  direction: "send" | "receive"
  event: string
  data: unknown
}

/**
 * Fields that should be removed or normalized before comparing frames.
 * These are inherently random or session-specific.
 */
const FIELDS_TO_NORMALIZE = [
  "gameId",
  "clientId",
  "socketId",
  "playerId",
  "inviteCode",
  "sessionId",
  "nonce",
  "id",
  "createdAt",
  "timestamp",
  "heartbeat",
  "connectionId",
]

/**
 * Recursively normalize an object by removing random/session-specific fields.
 */
function normalizeFrame(
  data: unknown,
  depth = 0,
  visited = new Set<object>()
): unknown {
  if (depth > 20) {
    return "[MAX_DEPTH_EXCEEDED]"
  }

  if (data === null || data === undefined) {
    return data
  }

  if (typeof data === "string") {
    // Normalize numeric codes that look like invite codes (5-6 digits)
    if (/^[0-9]{5,6}$/.test(data)) {
      return "[NORMALIZED]"
    }
    return data
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data
  }

  if (Array.isArray(data)) {
    return data.map((item) => normalizeFrame(item, depth + 1, visited))
  }

  if (typeof data === "object") {
    if (visited.has(data)) {
      return "[CIRCULAR_REFERENCE]"
    }
    visited.add(data)

    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase()
      if (FIELDS_TO_NORMALIZE.some((f) => keyLower.includes(f.toLowerCase()))) {
        normalized[key] = "[NORMALIZED]"
      } else {
        normalized[key] = normalizeFrame(value, depth + 1, visited)
      }
    }
    return normalized
  }

  return String(data)
}

/**
 * Records socket.io frames for a given flow.
 */
export class FrameRecorder {
  private frames: FrameLog[] = []
  private socket: Socket | null = null
  private outputPath: string
  private serverUrl: string

  constructor(outputPath: string, serverUrl: string = "http://localhost:3001") {
    this.outputPath = outputPath
    this.serverUrl = serverUrl
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  async connect(clientId?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const auth = clientId ? { clientId } : {}
      this.socket = io(this.serverUrl, {
        path: "/ws",
        auth,
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionDelayMax: 200,
        reconnectionAttempts: 10,
      })

      const originalEmit = this.socket.emit.bind(this.socket)
      this.socket.emit = ((event: string, ...args: unknown[]) => {
        this.frames.push({
          timestamp: Date.now(),
          direction: "send",
          event,
          data: args.length === 1 ? args[0] : args,
        })
        return originalEmit(event, ...args)
      }) as typeof this.socket.emit

      this.socket.on("connect", () => {
        console.log(`[Recorder] Connected to ${this.serverUrl}`)
        resolve(this.socket!)
      })

      this.socket.onAny((event: string, ...args: unknown[]) => {
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

  async emit(event: string, data?: unknown, waitFor?: string, timeout = 5000): Promise<unknown> {
    if (!this.socket) {
      throw new Error("Socket not connected")
    }

    return new Promise((resolve) => {
      if (waitFor) {
        const timer = setTimeout(() => {
          this.socket!.off(waitFor, handler)
          resolve(null)
        }, timeout)

        const handler = (data: unknown) => {
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
      data: normalizeFrame(frame.data),
    }))

    const output = {
      recordedAt: new Date().toISOString(),
      frameCount: normalized.length,
      frames: normalized,
    }

    fs.writeFileSync(this.outputPath, JSON.stringify(output, null, 2))
    console.log(`[Recorder] Saved ${normalized.length} frames to ${this.outputPath}`)
  }

  getFrames(): NormalizedFrame[] {
    return this.frames.map((frame) => ({
      direction: frame.direction,
      event: frame.event,
      data: normalizeFrame(frame.data),
    }))
  }

  getRawFrames(): FrameLog[] {
    return [...this.frames]
  }

  getFrameCount(): number {
    return this.frames.length
  }
}
