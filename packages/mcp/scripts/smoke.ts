/**
 * Smoke test for the MCP manager socket against both Rust and Node backends.
 *
 * Connects to a manager socket, authenticates with a password, waits for CONFIG,
 * and prints the quiz list as JSON lines.
 *
 * Usage:
 *   tsx scripts/smoke-mcp-manager.ts --url http://127.0.0.1:3012 --password <pw> --path /socket.io/
 *
 * Exit code: 0 on success, 1 on error.
 */

import { EVENTS } from "@razzoozle/common/constants"
import { io as ioClient, type Socket } from "socket.io-client"

interface Config {
  url: string
  password: string
  path: string
}

function parseArgs(argv: string[]): Config {
  const config: Config = {
    url: "http://127.0.0.1:3010",
    password: "",
    path: "/ws",
  }

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const next = argv[i + 1]

    if (flag === "--url" && next !== undefined) {
      config.url = next
      i += 1
    } else if (flag === "--password" && next !== undefined) {
      config.password = next
      i += 1
    } else if (flag === "--path" && next !== undefined) {
      config.path = next
      i += 1
    }
  }

  return config
}

async function main() {
  const config = parseArgs(process.argv.slice(2))

  if (!config.password) {
    console.error("Error: --password is required")
    process.exit(1)
  }

  const socket = ioClient(config.url, {
    path: config.path,
    autoConnect: false,
    reconnection: false,
    transports: ["websocket", "polling"],
    auth: { clientId: `smoke-${Date.now()}` },
  })

  let resolved = false

  const timeout = setTimeout(() => {
    if (!resolved) {
      resolved = true
      socket.close()
      console.error("Error: auth timed out after 15s")
      process.exit(1)
    }
  }, 15000)

  socket.on("connect_error", (error) => {
    if (!resolved) {
      resolved = true
      clearTimeout(timeout)
      socket.close()
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`Error: connection failed: ${msg}`)
      process.exit(1)
    }
  })

  socket.on("connect", () => {
    socket.emit(EVENTS.MANAGER.AUTH, config.password)
  })

  socket.on(EVENTS.MANAGER.CONFIG, (configData) => {
    if (resolved) return
    resolved = true
    clearTimeout(timeout)

    const config_obj = configData as { quizz?: Array<{id: string, subject: string, questionCount?: number}> }
    if (!config_obj || !Array.isArray(config_obj.quizz)) {
      socket.close()
      console.error("Error: invalid CONFIG payload (missing quizz array)")
      process.exit(1)
    }

    // Print quizzes as JSON lines
    for (const quiz of config_obj.quizz) {
      console.log(JSON.stringify({
        id: quiz.id,
        subject: quiz.subject,
        questionCount: quiz.questionCount || 0,
      }))
    }

    socket.close()
    process.exit(0)
  })

  socket.on(EVENTS.MANAGER.ERROR_MESSAGE, (message) => {
    if (!resolved) {
      resolved = true
      clearTimeout(timeout)
      socket.close()
      console.error(`Error: manager error: ${message}`)
      process.exit(1)
    }
  })

  socket.on(EVENTS.MANAGER.UNAUTHORIZED, () => {
    if (!resolved) {
      resolved = true
      clearTimeout(timeout)
      socket.close()
      console.error("Error: manager unauthorized (invalid password)")
      process.exit(1)
    }
  })

  socket.on("disconnect", () => {
    if (!resolved) {
      resolved = true
      clearTimeout(timeout)
      console.error("Error: socket disconnected unexpectedly")
      process.exit(1)
    }
  })

  socket.connect()
}

main()
