#!/usr/bin/env node
/**
 * e2e/scripts/upsert-quiz.mjs
 *
 * Idempotent quiz author script: connects via EDITOR socket path with manager auth,
 * reads a quiz fixture, and saves or updates it via socket.io.
 *
 * USAGE:
 *   E2E_URL=http://localhost:3011 E2E_PW=password E2E_PATH=/socket.io/ node e2e/scripts/upsert-quiz.mjs e2e/fixtures/all-types-quiz.json
 *   E2E_URL=http://localhost:3011 E2E_PW=password node e2e/scripts/upsert-quiz.mjs e2e/fixtures/python-basics-q6-fix.json
 *
 * Environment:
 *   E2E_URL     - socket server base URL (default: http://localhost:3011)
 *   E2E_PW      - manager password (NO DEFAULT; set at runtime)
 *   E2E_PATH    - socket.io path (default: /socket.io/)
 *
 * Events:
 *   quizz:save       - send new quiz
 *   quizz:saveSuccess - receive confirmation with { id }
 *   quizz:update     - send quiz update with { id, ...data }
 *   quizz:updateSuccess - receive confirmation with { id }
 *   quizz:error      - receive error message
 *   manager:config   - receive updated quiz list (broadcast)
 *
 * NOTE: The fixture may include an 'id' field; if absent, the server derives it from 'subject'.
 *       For python-basics-q6-fix, the fixture does NOT include 'id' at the top level; the server
 *       will match by subject and perform an update (read-modify-write the questions array).
 */

import { createRequire } from "module"
import { readFileSync, existsSync } from "fs"
import { resolve } from "path"

const require = createRequire(import.meta.url)
const { io } = require("socket.io-client")

const baseUrl = process.env.E2E_URL || "http://localhost:3011"
const password = process.env.E2E_PW
const socketPath = process.env.E2E_PATH || "/socket.io/"
const fixturePath = process.argv[2]

if (!password) {
  console.error("Error: E2E_PW environment variable is not set")
  process.exit(1)
}

if (!fixturePath) {
  console.error("Usage: node upsert-quiz.mjs <fixture-path>")
  console.error("Example: E2E_PW=mypassword node upsert-quiz.mjs e2e/fixtures/all-types-quiz.json")
  process.exit(1)
}

const fullFixturePath = resolve(fixturePath)
if (!existsSync(fullFixturePath)) {
  console.error(`Error: Fixture file not found: ${fullFixturePath}`)
  process.exit(1)
}

const fixture = JSON.parse(readFileSync(fullFixturePath, "utf-8"))

const socket = io(baseUrl, {
  path: socketPath,
  reconnection: true,
  reconnectionDelay: 100,
  reconnectionDelayMax: 1000,
})

let succeeded = false
let isConnected = false

const timeout = setTimeout(() => {
  console.error("Error: Connection timeout after 10 seconds")
  socket.disconnect()
  process.exit(1)
}, 10000)

socket.on("connect", () => {
  console.log(`Connected to ${baseUrl}${socketPath}`)
  isConnected = true
  clearTimeout(timeout)

  // Authenticate as manager
  socket.emit("manager:auth", password, (ack) => {
    if (ack?.error) {
      console.error("Authentication failed:", ack.error)
      socket.disconnect()
      process.exit(1)
    }
    console.log("Authenticated as manager")

    // Determine if this is a save (new) or update (existing)
    // Check if fixture has 'id' at top level or if 'subject' suggests an update
    const quizId = fixture.id || getIdFromSubject(fixture.subject)

    // For simplicity: always attempt to read first; if it exists, update; if not, save.
    // Since we can't easily query, we try update first, and if it fails, save.
    // Actually, simpler approach: send based on fixture structure.
    // If fixture.id exists, it's an update. Otherwise, it's a save (new).

    if (fixture.id) {
      // Update existing quiz
      console.log(`Updating quiz: ${fixture.id}`)
      socket.emit("quizz:update", { id: fixture.id, ...fixture })
    } else {
      // Save new quiz
      console.log(`Saving new quiz: ${fixture.subject}`)
      socket.emit("quizz:save", fixture)
    }
  })
})

socket.on("quizz:saveSuccess", (ack) => {
  console.log(`Quiz saved successfully with id: ${ack.id}`)
  succeeded = true
  socket.disconnect()
})

socket.on("quizz:updateSuccess", (ack) => {
  console.log(`Quiz updated successfully with id: ${ack.id}`)
  succeeded = true
  socket.disconnect()
})

socket.on("quizz:error", (error) => {
  console.error(`Quiz error: ${error}`)
  socket.disconnect()
  process.exit(1)
})

socket.on("manager:config", () => {
  // Config broadcast received (indicates the server processed the request)
  console.log("Config updated (broadcast received)")
})

socket.on("disconnect", () => {
  if (!isConnected) {
    console.error("Error: Failed to connect")
    process.exit(1)
  }
  if (succeeded) {
    console.log("Done. Disconnected.")
    process.exit(0)
  } else {
    console.error("Error: Disconnected without success")
    process.exit(1)
  }
})

socket.on("connect_error", (error) => {
  console.error("Connection error:", error.message)
  process.exit(1)
})

/**
 * Derive quiz id from subject by normalizing to a safe filename.
 * Matches the server-side logic in saveQuizz.
 */
function getIdFromSubject(subject) {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
