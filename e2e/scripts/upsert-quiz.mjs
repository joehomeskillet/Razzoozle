#!/usr/bin/env node
/**
 * e2e/scripts/upsert-quiz.mjs
 *
 * Idempotent quiz author script: connects via EDITOR socket path with manager auth,
 * reads a quiz fixture, and saves or updates it via socket.io.
 *
 * ARCHITECTURE (True Upsert via manager:config Quiz Metadata Lookup):
 * - manager:auth emits password (no callback); success = manager:config event
 * - manager:config payload includes quizz metadata array: { id, subject, archived, questionCount }
 * - On first manager:config: search for existing quiz by fixture.subject
 * - If found: quizz:update with existing id (id-preserving) → quizz:updateSuccess
 * - If not found: quizz:save (creates new with normalizeFilename+random id) → quizz:saveSuccess
 * - Idempotent: re-run same fixture updates same id, no duplication
 * - Note: manager:config re-broadcasts after save/update; writeTriggered guard prevents re-trigger
 *
 * USAGE:
 *   E2E_URL=http://localhost:3011 E2E_PW=password E2E_PATH=/socket.io/ node e2e/scripts/upsert-quiz.mjs e2e/fixtures/all-types-quiz.json
 *
 * Environment:
 *   E2E_URL     - socket server base URL (default: http://localhost:3011)
 *   E2E_PW      - manager password (required; no default)
 *   E2E_PATH    - socket.io path (default: /socket.io/)
 *
 * Events:
 *   manager:auth            - send password (no callback)
 *   manager:config          - receive after successful auth; payload.quizz = metadata array
 *   manager:errorMessage    - receive on auth failure or config read error
 *   manager:unauthorized    - receive if withAuth-protected events run before login
 *   quizz:save              - send new quiz (full fixture)
 *   quizz:saveSuccess       - receive confirmation with { id } (CREATE case)
 *   quizz:update            - send quiz update with { id, subject, questions, ... }
 *   quizz:updateSuccess     - receive confirmation with { id } (EXISTING case)
 *   quizz:error             - receive on validation or save/update failure
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
let isAuthenticated = false
let writeTriggered = false

// Global watchdog: 15 seconds total, never cleared before success
const globalWatchdog = setTimeout(() => {
  console.error("Error: Operation timeout after 15 seconds (not authenticated or save/update failed)")
  socket.disconnect()
  process.exit(1)
}, 15000)

socket.on("connect", () => {
  console.log(`Connected to ${baseUrl}${socketPath}`)
  isConnected = true

  // Send manager:auth (NO callback — success is manager:config event)
  console.log("Authenticating as manager...")
  socket.emit("manager:auth", password)
})

// Success signal: manager:config is emitted after successful login + emitConfig
// Payload includes quizz metadata array, which we use to decide save vs update
socket.on("manager:config", (payload) => {
  if (!isAuthenticated) {
    console.log("✓ Authenticated (manager:config received)")
    isAuthenticated = true
  }

  // Only trigger save/update once (manager:config re-broadcasts after each write)
  if (writeTriggered) {
    return
  }
  writeTriggered = true

  // Look up existing quiz by subject in the metadata array
  const quizzList = payload?.quizz || []
  const existing = quizzList.find((q) => q.subject === fixture.subject)

  if (existing) {
    // UPDATE existing quiz (preserves id)
    console.log(`Updating existing quiz: id="${existing.id}", subject="${existing.subject}"`)
    socket.emit("quizz:update", { id: existing.id, ...fixture })
  } else {
    // SAVE new quiz (server derives id via normalizeFilename + nanoid)
    console.log(`Saving new quiz: "${fixture.subject}"`)
    socket.emit("quizz:save", fixture)
  }
})

// Success: quiz created (save case)
socket.on("quizz:saveSuccess", (ack) => {
  console.log(`✓ Quiz created successfully`)
  console.log(`  ID: ${ack.id}`)
  console.log(`  Subject: "${fixture.subject}"`)
  console.log(`  Questions: ${fixture.questions.length}`)

  succeeded = true
  clearTimeout(globalWatchdog)
  socket.disconnect()
})

// Success: quiz updated (update case)
socket.on("quizz:updateSuccess", (ack) => {
  console.log(`✓ Quiz updated successfully`)
  console.log(`  ID: ${ack.id}`)
  console.log(`  Subject: "${fixture.subject}"`)
  console.log(`  Questions: ${fixture.questions.length}`)

  succeeded = true
  clearTimeout(globalWatchdog)
  socket.disconnect()
})

// Error: validation or save/update failed
socket.on("quizz:error", (error) => {
  console.error(`✗ Quiz error: ${error}`)
  clearTimeout(globalWatchdog)
  socket.disconnect()
  process.exit(1)
})

// Error: auth failed (invalid password, config read error, etc.)
socket.on("manager:errorMessage", (error) => {
  if (!isAuthenticated) {
    console.error(`✗ Authentication failed: ${error}`)
  } else {
    // After auth succeeded, errorMessage could be from a quiz operation
    console.error(`✗ Error: ${error}`)
  }
  clearTimeout(globalWatchdog)
  socket.disconnect()
  process.exit(1)
})

// Error: unauthorized (tried to use withAuth-protected event before login)
socket.on("manager:unauthorized", () => {
  console.error("✗ Unauthorized (attempted withAuth-protected event before login)")
  clearTimeout(globalWatchdog)
  socket.disconnect()
  process.exit(1)
})

socket.on("disconnect", () => {
  if (!isConnected) {
    console.error("Error: Failed to connect to server")
    clearTimeout(globalWatchdog)
    process.exit(1)
  }
  if (succeeded) {
    console.log("Done. Disconnected.")
    process.exit(0)
  }
  // If we get here without succeeded=true, the watchdog will have already fired
})

socket.on("connect_error", (error) => {
  console.error(`Connection error: ${error.message}`)
  clearTimeout(globalWatchdog)
  process.exit(1)
})
