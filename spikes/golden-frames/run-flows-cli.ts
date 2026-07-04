#!/usr/bin/env node
/**
 * CLI entry point for running flows against a running server
 * Usage: tsx run-flows-cli.ts [--server-url http://localhost:3310] [--output-dir ./output]
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  // Parse args
  const args = process.argv.slice(2)
  const serverUrl = args[args.indexOf("--server-url") + 1] || "http://localhost:3310"
  const outputDir = args[args.indexOf("--output-dir") + 1] || path.join(__dirname, "output")
  const quizzId = "example"

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  try {
    console.log("========================================")
    console.log("Golden-Frame Flow Runner")
    console.log("========================================")
    console.log(`Server URL: ${serverUrl}`)
    console.log(`Output dir: ${outputDir}\n`)

    // Import flows
    const { runFlow1 } = await import("./flow1-manager-create-player-join.ts")
    const { runFlow2 } = await import("./flow2-question-answer.ts")
    const { runFlow3 } = await import("./flow3-reveal-leaderboard.ts")

    // Run Flow 1
    console.log("\n=== FLOW 1 ===")
    const { gameId, inviteCode } = await runFlow1(outputDir, serverUrl, quizzId)
    console.log(`✓ Flow 1 complete: gameId=${gameId}, inviteCode=${inviteCode}`)

    // Wait before Flow 2
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Run Flow 2
    console.log("\n=== FLOW 2 ===")
    await runFlow2(outputDir, serverUrl, gameId)
    console.log(`✓ Flow 2 complete`)

    // Wait before Flow 3
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Run Flow 3
    console.log("\n=== FLOW 3 ===")
    await runFlow3(outputDir, serverUrl, gameId)
    console.log(`✓ Flow 3 complete`)

    // Summary
    console.log("\n========================================")
    console.log("Golden-frame recording complete!")
    console.log("========================================")
    const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".json"))
    console.log("\nGenerated files:")
    files.forEach((file) => {
      const filePath = path.join(outputDir, file)
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"))
      const frameCount = content.frameCount || 0
      console.log(`  ✓ ${file}: ${frameCount} frames`)
    })
    console.log("\n========================================")
  } catch (error) {
    console.error("\nError:", error)
    process.exit(1)
  }
}

main()
