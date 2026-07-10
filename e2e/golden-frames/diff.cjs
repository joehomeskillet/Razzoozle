// E2E diff runner: compares two golden-frames driver outputs (Node vs Rust)
// and reports per-question-type: missing events, extra events, ordering drift,
// summary-shape drift. Time-ish numeric values are masked (they legitimately differ).
// Exit 0 = no NON-time drift (parity OK), 1 = structural differences (parity FAIL).
//
// Usage: node diff.cjs <nodeLogPath> <rustLogPath>

const fs = require("fs")

const [, , nodeLogPath, rustLogPath] = process.argv

if (!nodeLogPath || !rustLogPath) {
  console.error("Usage: node diff.cjs <nodeLogPath> <rustLogPath>")
  process.exit(1)
}

let nodeLog, rustLog
try {
  nodeLog = JSON.parse(fs.readFileSync(nodeLogPath, "utf8"))
  rustLog = JSON.parse(fs.readFileSync(rustLogPath, "utf8"))
} catch (e) {
  console.error(`Failed to read/parse logs: ${e.message}`)
  process.exit(1)
}

// Mask time-ish values in summaries so they don't count as drift.
// E.g., "num(15000)" (timeout) → "time", "num~1e3" → "order~1e3"
function maskTimeValues(summary) {
  if (!summary || typeof summary !== "string") return summary
  // Mask epoch numbers (num:EPOCH -> time)
  let masked = summary.replace(/num:EPOCH\([^)]*\)/g, "time:masked")
  // Mask time-keyed numeric values (num(123) -> time:value)
  masked = masked.replace(/\bnum\(\d+\)/g, "time:masked")
  return masked
}

// Parse event stream and extract question-type transitions
function extractQuestionContext(events) {
  const questions = []
  let currentQ = null

  for (const evt of events) {
    const msg = evt.event
    // A "type=X" note indicates question type
    if (evt.role && evt.event && msg.includes("type=")) {
      const match = evt.s && evt.s.match(/type=(\w+)/)
      if (match) {
        currentQ = { type: match[1], startIdx: questions.length, events: [] }
        questions.push(currentQ)
      }
    }
    if (currentQ) {
      currentQ.events.push(evt)
    }
  }

  return questions
}

// Compare two event lists per role, handling time-value masking
function compareEventStreams(nodeEvents, rustEvents) {
  const diffs = {
    missing: [],
    extra: [],
    orderingDrift: false,
    summaryDrift: false,
  }

  const nodeByRole = {}
  const rustByRole = {}

  // Group by role
  for (const evt of nodeEvents) {
    if (!nodeByRole[evt.role]) nodeByRole[evt.role] = []
    nodeByRole[evt.role].push(evt)
  }
  for (const evt of rustEvents) {
    if (!rustByRole[evt.role]) rustByRole[evt.role] = []
    rustByRole[evt.role].push(evt)
  }

  // Compare per role
  for (const role of Object.keys(nodeByRole)) {
    const nodeBranch = nodeByRole[role]
    const rustBranch = rustByRole[role] || []

    // Build signature (event + masked summary)
    const nodeSigs = nodeBranch.map((e) => `${e.event}|${maskTimeValues(e.s)}`)
    const rustSigs = rustBranch.map((e) => `${e.event}|${maskTimeValues(e.s)}`)

    // Check for missing / extra
    for (const [i, sig] of nodeSigs.entries()) {
      if (!rustSigs.includes(sig)) {
        diffs.missing.push({ role, idx: i, sig })
      }
    }
    for (const [i, sig] of rustSigs.entries()) {
      if (!nodeSigs.includes(sig)) {
        diffs.extra.push({ role, idx: i, sig })
      }
    }

    // Ordering check (ignoring time values)
    if (nodeSigs.length !== rustSigs.length) {
      diffs.orderingDrift = true
    } else {
      for (let i = 0; i < nodeSigs.length; i++) {
        if (nodeSigs[i] !== rustSigs[i]) {
          diffs.orderingDrift = true
          break
        }
      }
    }

    // Summary shape drift (structural difference after time masking)
    for (let i = 0; i < Math.min(nodeBranch.length, rustBranch.length); i++) {
      const nodeS = maskTimeValues(nodeBranch[i].s)
      const rustS = maskTimeValues(rustBranch[i].s)
      if (nodeS !== rustS) {
        diffs.summaryDrift = true
        break
      }
    }
  }

  return diffs
}

// Main report
console.log("═══════════════════════════════════════════════════════════════")
console.log("E2E Golden-Frames Diff Report")
console.log("═══════════════════════════════════════════════════════════════")
console.log()
console.log(`Node log:     ${nodeLogPath}`)
console.log(`Rust log:     ${rustLogPath}`)
console.log()

// Overall event count
console.log(`Node events: ${nodeLog.events.length}, gaps: ${nodeLog.gapCount}`)
console.log(`Rust events: ${rustLog.events.length}, gaps: ${rustLog.gapCount}`)
console.log()

// Extract question contexts
const nodeQs = extractQuestionContext(nodeLog.events)
const rustQs = extractQuestionContext(rustLog.events)

console.log(`Node questions: ${nodeQs.length} (~${nodeQs.map((q) => q.type).join(", ")})`)
console.log(`Rust questions: ${rustQs.length} (~${rustQs.map((q) => q.type).join(", ")})`)
console.log()

// Per-type comparison
const diffs = compareEventStreams(nodeLog.events, rustLog.events)

if (diffs.missing.length === 0 && diffs.extra.length === 0 && !diffs.orderingDrift && !diffs.summaryDrift) {
  console.log("✓ No parity drift detected (time values masked)")
  console.log()
  process.exit(0)
} else {
  console.log("✗ Parity drift detected:")
  console.log()
  if (diffs.missing.length > 0) {
    console.log(`Missing in Rust (${diffs.missing.length}):`)
    diffs.missing.slice(0, 5).forEach((d) => {
      console.log(`  ${d.role}[${d.idx}]: ${d.sig}`)
    })
    if (diffs.missing.length > 5) console.log(`  ... and ${diffs.missing.length - 5} more`)
    console.log()
  }
  if (diffs.extra.length > 0) {
    console.log(`Extra in Rust (${diffs.extra.length}):`)
    diffs.extra.slice(0, 5).forEach((d) => {
      console.log(`  ${d.role}[${d.idx}]: ${d.sig}`)
    })
    if (diffs.extra.length > 5) console.log(`  ... and ${diffs.extra.length - 5} more`)
    console.log()
  }
  if (diffs.orderingDrift) {
    console.log("⚠ Event ordering differs (same events, different sequence)")
    console.log()
  }
  if (diffs.summaryDrift) {
    console.log("⚠ Event summary structure differs (after time masking)")
    console.log()
  }
  console.log("═══════════════════════════════════════════════════════════════")
  process.exit(1)
}
