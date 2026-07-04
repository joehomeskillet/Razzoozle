#!/usr/bin/env tsx
/**
 * Golden-Frame Test Runner
 *
 * Orchestrates:
 * 1. Start the socket server
 * 2. Setup fixture quiz
 * 3. Run 3 flows:
 *    - Flow 1: Manager create + player join
 *    - Flow 2: Question round with answer submission
 *    - Flow 3: Result/reveal + leaderboard
 * 4. Stop the server
 * 5. Save normalized frame logs
 *
 * Usage:
 *   tsx run-golden-tests.ts [--output-dir ./output] [--server-url http://localhost:3310]
 */

import fs from "fs"
import path from "path"
import { spawn, execSync } from "child_process"
import { fileURLToPath } from "url"
import type { ChildProcess } from "child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface Options {
  outputDir: string
  serverUrl: string
  serverPort: number
  repoRoot: string
  fixtureDir: string
  wtPath: string
}

/**
 * Parse command-line arguments
 */
function parseArgs(): Options {
  const args = process.argv.slice(2)
  const outputDir =
    args[args.indexOf("--output-dir") + 1] || path.join(__dirname, "output")
  const serverUrl = args[args.indexOf("--server-url") + 1] || "http://localhost:3310"
  const serverPort = 3310

  // Assuming this script runs from spikes/golden-frames/
  const repoRoot = path.join(__dirname, "../..")
  const fixtureDir = path.join(repoRoot, "config/quizzes")

  // Clean worktree path for recording server
  const wtPath =
    "/tmp/claude-0/-nvmetank1-projects-Razzoozle/981f5eb0-4942-45ed-b56d-dbc5f396745a/scratchpad/golden-wt"

  return {
    outputDir,
    serverUrl,
    serverPort,
    repoRoot,
    fixtureDir,
    wtPath,
  }
}

/**
 * Wait for server to be ready
 */
async function waitForServer(url: string, maxRetries = 30): Promise<void> {
  console.log(`\n[Main] Waiting for server to be ready at ${url}...`)

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${url.replace(/wss?/, "http")}/healthz`)
      if (response.ok) {
        console.log("[Main] Server is ready!")
        return
      }
    } catch {
      // Server not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Server did not become ready after ${maxRetries} seconds`)
}

/**
 * Start the socket server from the clean worktree
 */
function startServer(wtPath: string, port: number): ChildProcess {
  console.log(`\n[Main] Starting socket server on port ${port} from ${wtPath}...`)

  // Ensure node_modules exists
  const nodeModulesPath = path.join(wtPath, "node_modules")
  if (!fs.existsSync(nodeModulesPath)) {
    console.log("[Main] Installing dependencies in worktree...")
    execSync("pnpm install", { cwd: wtPath, stdio: "inherit" })
  }

  const serverProcess = spawn("pnpm", ["dev:socket"], {
    cwd: wtPath,
    env: {
      ...process.env,
      WS_PORT: String(port),
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  // Log server output for debugging
  serverProcess.stdout?.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean)
    lines.forEach((line: string) => {
      if (line.includes("listening") || line.includes("started") || line.includes("ready") || line.includes("port")) {
        console.log(`[Server] ${line}`)
      }
    })
  })

  serverProcess.stderr?.on("data", (data) => {
    console.error(`[Server Error] ${data}`)
  })

  return serverProcess
}

/**
 * Copy fixture quiz to config directory in the worktree
 */
function setupFixtureQuiz(wtPath: string): void {
  console.log(`\n[Main] Setting up fixture quiz...`)

  const fixtureDir = path.join(wtPath, "config/quizzes")

  if (!fs.existsSync(fixtureDir)) {
    fs.mkdirSync(fixtureDir, { recursive: true })
  }

  const fixtureQuizPath = path.join(__dirname, "fixture-quiz.json")
  const targetPath = path.join(fixtureDir, "golden-test-quiz.json")

  if (fs.existsSync(fixtureQuizPath)) {
    fs.copyFileSync(fixtureQuizPath, targetPath)
    console.log(`[Main] Fixture quiz copied to ${targetPath}`)
  } else {
    console.warn(`[Main] Fixture quiz not found at ${fixtureQuizPath}`)
  }
}

/**
 * Run all three flows
 */
async function runFlows(options: Options): Promise<void> {
  console.log(`\n[Main] Running golden-frame flows...`)

  // Create output directory
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true })
  }

  // Import flows dynamically
  const { runFlow1 } = await import("./flow1-manager-create-player-join.ts")
  const { runFlow2 } = await import("./flow2-question-answer.ts")
  const { runFlow3 } = await import("./flow3-reveal-leaderboard.ts")

  // Run Flow 1
  console.log("\n[Main] === Running Flow 1 ===")
  const { gameId, inviteCode } = await runFlow1(options.outputDir, options.serverUrl, "golden-test-quiz")
  console.log(`[Main] Flow 1 complete. gameId=${gameId}, inviteCode=${inviteCode}`)

  // Wait before running Flow 2
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Run Flow 2
  console.log("\n[Main] === Running Flow 2 ===")
  await runFlow2(options.outputDir, options.serverUrl, gameId)
  console.log(`[Main] Flow 2 complete`)

  // Wait before running Flow 3
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Run Flow 3
  console.log("\n[Main] === Running Flow 3 ===")
  await runFlow3(options.outputDir, options.serverUrl, gameId)
  console.log(`[Main] Flow 3 complete`)

  console.log("\n[Main] All flows completed!")
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log("========================================")
  console.log("Golden-Frame Test Runner")
  console.log("========================================")

  const options = parseArgs()
  console.log(`\nConfiguration:
  - Output directory: ${options.outputDir}
  - Server URL: ${options.serverUrl}
  - Server port: ${options.serverPort}
  - Worktree: ${options.wtPath}`)

  let serverProcess: ChildProcess | null = null

  try {
    // Setup
    setupFixtureQuiz(options.wtPath)

    // Start server
    serverProcess = startServer(options.wtPath, options.serverPort)

    // Wait for server
    await waitForServer(options.serverUrl)

    // Run flows
    await runFlows(options)

    console.log("\n========================================")
    console.log("Golden-frame recording complete!")
    console.log(`Frames saved to: ${options.outputDir}`)
    console.log("\nOutput files:")
    const outputFiles = fs.readdirSync(options.outputDir).filter((f) => f.endsWith(".json"))
    outputFiles.forEach((file) => {
      const filePath = path.join(options.outputDir, file)
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"))
      const frameCount = content.frameCount || 0
      console.log(`  - ${file}: ${frameCount} frames`)
    })
    console.log("========================================")
  } catch (error) {
    console.error("\n[Main] Error:", error)
    process.exit(1)
  } finally {
    // Stop server
    if (serverProcess) {
      console.log("\n[Main] Stopping server...")
      serverProcess.kill("SIGTERM")

      // Wait for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 2000))

      if (!serverProcess.killed) {
        serverProcess.kill("SIGKILL")
      }

      console.log("[Main] Server stopped.")
    }
  }
}

main().catch(console.error)
