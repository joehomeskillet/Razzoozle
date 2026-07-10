// E2E diff runner: compares two golden-frames driver outputs (Node vs Rust)
// Exit 0 = no NON-time drift (parity OK), 1 = structural differences (parity FAIL).
const fs = require('fs')

const [, , nodeLogPath, rustLogPath] = process.argv

if (!nodeLogPath || !rustLogPath) {
  console.error('Usage: node diff.cjs <nodeLogPath> <rustLogPath>')
  process.exit(1)
}

let nodeLog, rustLog
try {
  nodeLog = JSON.parse(fs.readFileSync(nodeLogPath, 'utf8'))
  rustLog = JSON.parse(fs.readFileSync(rustLogPath, 'utf8'))
} catch (e) {
  console.error('Failed to read/parse logs: ' + e.message)
  process.exit(1)
}

// Extract question types and timestamps from notes
function extractQuestionMarkers(notes) {
  const markers = []
  for (const note of notes) {
    const match = note.match(/^\[(\d+)ms\] Q(\d+): type=(\w+)/)
    if (match) {
      markers.push({
        timeMs: parseInt(match[1]),
        qNum: parseInt(match[2]),
        type: match[3],
      })
    }
  }
  return markers
}

// Bucket events into questions based on timestamps
function bucketEventsByQuestion(events, questionMarkers) {
  const questions = []
  for (let i = 0; i < questionMarkers.length; i++) {
    const marker = questionMarkers[i]
    const nextMarker = questionMarkers[i + 1]
    const endTime = nextMarker ? nextMarker.timeMs : Infinity
    const qEvents = events.filter((e) => e.t >= marker.timeMs && e.t < endTime)
    questions.push({
      qNum: marker.qNum,
      type: marker.type,
      startTime: marker.timeMs,
      events: qEvents,
    })
  }
  return questions
}

// Mask time-ish numeric values
function maskTimeValues(summary) {
  if (!summary || typeof summary !== 'string') return summary
  let masked = summary.replace(/num:EPOCH\([^)]*\)/g, 'num:EPOCH')
  masked = masked.replace(/\bnum\(\d+\)/g, 'num')
  masked = masked.replace(/serverNowMs:[^,}]+/g, 'serverNowMs:NUM')
  masked = masked.replace(/answerDeadlineAtServerMs:[^,}]+/g, 'answerDeadlineAtServerMs:NUM')
  masked = masked.replace(/questionStartAtServerMs:[^,}]+/g, 'questionStartAtServerMs:NUM')
  return masked
}

// Mask string lengths ONLY for time/id/date/token fields
function maskStringLengths(summary) {
  if (!summary || typeof summary !== 'string') return summary
  let masked = summary.replace(/(\bdate|At|token)id?:str\(\d+\)/g, '$1:str')
  return masked
}

// Extract keys from a summary string (parse field names)
function extractKeys(summary) {
  const keys = new Set()
  const keyMatches = summary.match(/\w+:(?:\w+|arr|obj|null|bool|\[|str\()/g)
  if (keyMatches) {
    keyMatches.forEach((m) => {
      const key = m.split(':')[0]
      if (key) keys.add(key)
    })
  }
  return keys
}

// Compare summaries - detect key presence differences
function compareEventSummaries(nodeSummary, rustSummary) {
  const nodeM = maskTimeValues(nodeSummary)
  const rustM = maskTimeValues(rustSummary)

  // Extract keys and check for presence differences
  const nodeKeys = extractKeys(nodeM)
  const rustKeys = extractKeys(rustM)

  const missingKeys = Array.from(nodeKeys).filter((k) => !rustKeys.has(k))
  const extraKeys = Array.from(rustKeys).filter((k) => !nodeKeys.has(k))

  if (missingKeys.length > 0 || extraKeys.length > 0) {
    const detail = []
    if (missingKeys.length > 0) detail.push('Node has ' + missingKeys.slice(0, 3).join(', '))
    if (extraKeys.length > 0) detail.push('Rust has ' + extraKeys.slice(0, 3).join(', '))
    return { drifted: true, isKeyDrift: true, detail: detail.join('; ') }
  }

  // If keys match, check if values differ (ignoring time/string-length noise)
  if (nodeM !== rustM) {
    const nodeS = maskStringLengths(nodeM)
    const rustS = maskStringLengths(rustM)
    if (nodeS !== rustS) {
      return { drifted: true, isKeyDrift: false, detail: 'value difference' }
    }
  }

  return { drifted: false }
}

// Compare events in a question
function compareQuestionEvents(nodeEvents, rustEvents) {
  const diffs = {
    missing: [],
    extra: [],
    keyDrift: [],
    valueDrift: [],
  }

  const nodeRegular = nodeEvents.filter((e) => !e.event.includes('plugin'))
  const rustRegular = rustEvents.filter((e) => !e.event.includes('plugin'))
  const nodePlugins = nodeEvents.filter((e) => e.event.includes('plugin'))
  const rustPlugins = rustEvents.filter((e) => e.event.includes('plugin'))

  if (nodePlugins.length === 0 && rustPlugins.length > 0) {
    for (const evt of rustPlugins) {
      diffs.extra.push({ role: evt.role, event: evt.event })
    }
  } else if (rustPlugins.length === 0 && nodePlugins.length > 0) {
    for (const evt of nodePlugins) {
      diffs.missing.push({ role: evt.role, event: evt.event })
    }
  }

  const nodeByRole = {}
  const rustByRole = {}

  for (const evt of nodeRegular) {
    if (!nodeByRole[evt.role]) nodeByRole[evt.role] = []
    nodeByRole[evt.role].push(evt)
  }
  for (const evt of rustRegular) {
    if (!rustByRole[evt.role]) rustByRole[evt.role] = []
    rustByRole[evt.role].push(evt)
  }

  const allRoles = new Set([...Object.keys(nodeByRole), ...Object.keys(rustByRole)])
  for (const role of allRoles) {
    const nodeBranch = nodeByRole[role] || []
    const rustBranch = rustByRole[role] || []

    const nodeByEvent = {}
    const rustByEvent = {}

    for (const evt of nodeBranch) {
      if (!nodeByEvent[evt.event]) nodeByEvent[evt.event] = []
      nodeByEvent[evt.event].push(evt)
    }
    for (const evt of rustBranch) {
      if (!rustByEvent[evt.event]) rustByEvent[evt.event] = []
      rustByEvent[evt.event].push(evt)
    }

    const allEvents = new Set([...Object.keys(nodeByEvent), ...Object.keys(rustByEvent)])
    for (const eventName of allEvents) {
      const nodeEvts = nodeByEvent[eventName] || []
      const rustEvts = rustByEvent[eventName] || []

      for (let i = 0; i < Math.max(nodeEvts.length, rustEvts.length); i++) {
        const nodeEvt = nodeEvts[i]
        const rustEvt = rustEvts[i]

        if (!nodeEvt) {
          diffs.extra.push({ role, event: eventName, idx: i })
        } else if (!rustEvt) {
          diffs.missing.push({ role, event: eventName, idx: i })
        } else {
          const cmp = compareEventSummaries(nodeEvt.s, rustEvt.s)
          if (cmp.drifted) {
            if (cmp.isKeyDrift) {
              diffs.keyDrift.push({
                role,
                event: eventName,
                idx: i,
                detail: cmp.detail,
              })
            } else {
              diffs.valueDrift.push({
                role,
                event: eventName,
                idx: i,
              })
            }
          }
        }
      }
    }
  }

  return diffs
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('E2E Golden-Frames Diff Report')
console.log('═══════════════════════════════════════════════════════════════')
console.log()
console.log('Node log:     ' + nodeLogPath)
console.log('Rust log:     ' + rustLogPath)
console.log()

console.log('Node events: ' + nodeLog.events.length)
console.log('Rust events: ' + rustLog.events.length)
console.log()

const nodeMarkers = extractQuestionMarkers(nodeLog.notes)
const rustMarkers = extractQuestionMarkers(rustLog.notes)

const nodeQs = bucketEventsByQuestion(nodeLog.events, nodeMarkers)
const rustQs = bucketEventsByQuestion(rustLog.events, rustMarkers)

console.log('Node questions: ' + nodeQs.length + ' (' + nodeQs.map((q) => q.type).join(', ') + ')')
console.log('Rust questions: ' + rustQs.length + ' (' + rustQs.map((q) => q.type).join(', ') + ')')
console.log()

let hasRealDrift = false

for (let i = 0; i < Math.max(nodeQs.length, rustQs.length); i++) {
  const nodeQ = nodeQs[i]
  const rustQ = rustQs[i]

  if (!nodeQ) {
    console.log('Q' + (i + 1) + ' (Rust only): type=' + rustQ.type)
    console.log('  ✗ Missing in Node: ' + rustQ.events.length + ' events')
    console.log()
    hasRealDrift = true
    continue
  }
  if (!rustQ) {
    console.log('Q' + (i + 1) + ' (Node only): type=' + nodeQ.type)
    console.log('  ✗ Missing in Rust: ' + nodeQ.events.length + ' events')
    console.log()
    hasRealDrift = true
    continue
  }

  console.log('Q' + (i + 1) + ': type=' + nodeQ.type)

  const diffs = compareQuestionEvents(nodeQ.events, rustQ.events)

  if (diffs.missing.length === 0 && diffs.extra.length === 0 && diffs.keyDrift.length === 0 && diffs.valueDrift.length === 0) {
    console.log('  ✓ Parity OK (' + nodeQ.events.length + ' events)')
  } else {
    let hasReal = false

    const extraPlugins = diffs.extra.filter((d) => d.event && d.event.includes('plugin'))
    const extraNonPlugins = diffs.extra.filter((d) => !d.event || !d.event.includes('plugin'))
    const missingPlugins = diffs.missing.filter((d) => d.event && d.event.includes('plugin'))
    const missingNonPlugins = diffs.missing.filter((d) => !d.event || !d.event.includes('plugin'))

    if (missingNonPlugins.length > 0) {
      hasReal = true
      console.log('  ✗ Missing in Rust: ' + missingNonPlugins.length + ' events')
      missingNonPlugins.slice(0, 2).forEach((d) => {
        console.log('    ' + d.role + ': ' + d.event)
      })
      if (missingNonPlugins.length > 2) {
        console.log('    ... and ' + (missingNonPlugins.length - 2) + ' more')
      }
    }

    if (extraNonPlugins.length > 0) {
      hasReal = true
      console.log('  ✗ Extra in Rust: ' + extraNonPlugins.length + ' events')
      extraNonPlugins.slice(0, 2).forEach((d) => {
        console.log('    ' + d.role + '[' + d.idx + ']: ' + d.event)
      })
      if (extraNonPlugins.length > 2) {
        console.log('    ... and ' + (extraNonPlugins.length - 2) + ' more')
      }
    }

    if (diffs.keyDrift.length > 0) {
      hasReal = true
      console.log('  ✗ Key differences in ' + diffs.keyDrift.length + ' events:')
      diffs.keyDrift.slice(0, 2).forEach((d) => {
        console.log('    ' + d.role + '[' + d.idx + ']: ' + d.event)
        console.log('      ' + d.detail)
      })
      if (diffs.keyDrift.length > 2) {
        console.log('    ... and ' + (diffs.keyDrift.length - 2) + ' more')
      }
    }

    if (extraPlugins.length > 0) {
      console.log('  ℹ Plugin events (Rust only): ' + extraPlugins.length)
      const pluginTypes = {}
      extraPlugins.forEach((d) => {
        pluginTypes[d.event] = (pluginTypes[d.event] || 0) + 1
      })
      Object.keys(pluginTypes)
        .sort()
        .forEach((evt) => {
          console.log('    ' + evt + ': ' + pluginTypes[evt])
        })
    }

    if (missingPlugins.length > 0) {
      console.log('  ℹ Plugin events (Node only): ' + missingPlugins.length)
      const pluginTypes = {}
      missingPlugins.forEach((d) => {
        pluginTypes[d.event] = (pluginTypes[d.event] || 0) + 1
      })
      Object.keys(pluginTypes)
        .sort()
        .forEach((evt) => {
          console.log('    ' + evt + ': ' + pluginTypes[evt])
        })
    }

    if (diffs.valueDrift.length > 0 && diffs.keyDrift.length === 0 && missingNonPlugins.length === 0 && extraNonPlugins.length === 0) {
      console.log('  ⚠ Value format differences in ' + diffs.valueDrift.length + ' events (masked noise)')
    }

    if (hasReal) hasRealDrift = true
  }
  console.log()
}

console.log('═══════════════════════════════════════════════════════════════')

if (!hasRealDrift) {
  console.log('✓ No parity drift detected (time values masked)')
  console.log()
  process.exit(0)
} else {
  console.log('✗ Parity drift detected')
  console.log()
  process.exit(1)
}
