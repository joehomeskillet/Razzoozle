// E2E golden-frames game driver: plays one full game (manager + 2 players)
// against ONE backend, supporting ALL 7 question types (choice, boolean, slider,
// poll, multiple-select, type-answer, sentence-builder).
//
// Per-type answer strategies:
//   - choice/boolean/poll: answerKey (number index)
//   - slider: answerKey (number value)
//   - multiple-select: answerKeys (number[] of indices)
//   - type-answer: answerText (string; ignores answerKey)
//   - sentence-builder: answerKeys (number[] of chunk indices)
//
// Player1 = correct/fixture-based answers; Player2 = different/wrong answers.
// Deterministic: same run yields same event stream (same RNG seed if applicable).
//
// Logs every event as { t, role, event, summary } to OUT JSON file.
// Timeouts logged as GAP records, never crash. Usage:
//   E2E_URL=http://127.0.0.1:3011 E2E_PW=<pw> E2E_OUT=<file> [E2E_PATH=/ws] node driver.cjs

const { io } = require("socket.io-client")
const fs = require("fs")
const path = require("path")

const URL = process.env.E2E_URL
const PW = process.env.E2E_PW
const OUT = process.env.E2E_OUT
const IOPATH = process.env.E2E_PATH || "/socket.io/"

if (!URL || !PW || !OUT) {
  console.error("E2E_URL / E2E_PW / E2E_OUT required")
  process.exit(3)
}

const T0 = Date.now()
const log = {
  url: URL,
  startedAt: new Date().toISOString(),
  steps: [],
  gaps: [],
  notes: [],
  events: [],
}

const now = () => Date.now() - T0
const step = (s) => {
  log.steps.push(`[${now()}ms] ${s}`)
  console.log(`[${now()}ms] ${s}`)
}
const note = (s) => {
  log.notes.push(`[${now()}ms] ${s}`)
  console.log(`NOTE [${now()}ms] ${s}`)
}
const gap = (role, expected, detail) => {
  log.gaps.push({
    t: now(),
    role,
    expected,
    detail: detail || "timeout (10s-class silent drop)",
  })
  console.log(`GAP [${now()}ms] ${role} expected=${expected} ${detail || ""}`)
}

const TIMEISH = /time|cooldown|countdown|deadline|ms$|date|epoch|duration|deltasec/i

function summarize(v, key, depth) {
  key = key || ""
  depth = depth || 0
  if (v === null) return "null"
  if (v === undefined) return "undef"
  const t = typeof v
  if (t === "number") {
    if (Math.abs(v) >= 1e11) return `num:EPOCH(${v})`
    if (TIMEISH.test(key)) return `num(${v})`
    const order = v === 0 ? 0 : Math.floor(Math.log10(Math.abs(v)))
    return `num~1e${order}`
  }
  if (t === "string") return `str(${v.length})`
  if (t === "boolean") return `bool(${v})`
  if (Array.isArray(v)) {
    if (depth >= 3) return `arr(${v.length})`
    return `arr(${v.length})[${v.length ? summarize(v[0], key, depth + 1) : ""}]`
  }
  if (t === "object") {
    if (depth >= 3) return "obj"
    const keys = Object.keys(v).sort()
    return (
      "{" +
      keys.map((k) => `${k}:${summarize(v[k], k, depth + 1)}`).join(",") +
      "}"
    )
  }
  return t
}

function record(role, event, payload) {
  log.events.push({ t: now(), role, event, s: summarize(payload, event, 0) })
}

function connect(role, clientId) {
  const s = io(URL, { path: IOPATH, transports: ["websocket"], auth: { clientId } })
  s.onAny((ev, ...args) => record(role, ev, args.length > 1 ? args : args[0]))
  s.on("connect", () => record(role, "__connect", { ok: true }))
  s.on("connect_error", (e) => record(role, "__connect_error", String(e && e.message)))
  s.on("disconnect", (r) => record(role, "__disconnect", String(r)))
  return s
}

function waitEvent(sock, role, event, pred, ms, label) {
  ms = ms || 10000
  return new Promise((resolve) => {
    const h = (data) => {
      if (!pred || pred(data)) {
        clearTimeout(t)
        sock.off(event, h)
        resolve(data)
      }
    }
    const t = setTimeout(() => {
      sock.off(event, h)
      gap(role, label || event)
      resolve(undefined)
    }, ms)
    sock.on(event, h)
  })
}

const waitStatus = (sock, role, names, ms) =>
  waitEvent(
    sock,
    role,
    "game:status",
    (d) => d && names.includes(d.name),
    ms,
    `game:status[${names.join("|")}]`,
  )

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Answer logic: per-type strategies for P1 (correct) and P2 (wrong/different)
function getP1Answer(question) {
  const { type, solutions, answers, min, max, correct, acceptedAnswers, chunks } = question

  switch (type) {
    case "choice":
    case "boolean":
      // Use first solution
      return { answerKey: solutions && solutions.length ? solutions[0] : 0 }

    case "slider":
      // Use correct value from question definition
      return { answerKey: correct !== undefined ? correct : Math.round((min + max) / 2) }

    case "poll":
      // No solutions — use first answer (canonical vote)
      return { answerKey: 0 }

    case "multiple-select":
      // Use all solutions
      return { answerKeys: solutions && solutions.length ? solutions : [0] }

    case "type-answer":
      // Use first accepted answer
      return { answerText: acceptedAnswers && acceptedAnswers.length ? acceptedAnswers[0] : "answer" }

    case "sentence-builder":
      // Use chunks in order (indices 0,1,2,...)
      const chunkCount = chunks && Array.isArray(chunks) ? chunks.length : 0
      return { answerKeys: Array.from({ length: chunkCount }, (_, i) => i) }

    default:
      return { answerKey: 0 }
  }
}

function getP2Answer(question) {
  const { type, solutions, answers, min, max, correct, acceptedAnswers, chunks } = question
  const answerCount = answers ? answers.length : 4

  switch (type) {
    case "choice":
      // Pick a different answer (not the solution)
      const choiceSol = solutions && solutions.length ? solutions[0] : 1
      return { answerKey: (choiceSol + 1) % answerCount }

    case "boolean":
      // Opposite of solution
      const boolSol = solutions && solutions.length ? solutions[0] : 0
      return { answerKey: boolSol === 0 ? 1 : 0 }

    case "slider":
      // Use min (extreme opposite of correct)
      return { answerKey: min !== undefined ? min : 1 }

    case "poll":
      // Different from P1's vote (P1 uses 0)
      return { answerKey: 1 }

    case "multiple-select":
      // Different set: pick some non-solution indices
      const wrongSet = []
      for (let i = 0; i < answerCount && wrongSet.length < 2; i++) {
        if (!solutions || !solutions.includes(i)) {
          wrongSet.push(i)
        }
      }
      return { answerKeys: wrongSet.length > 0 ? wrongSet : [0] }

    case "type-answer":
      // Different text
      return { answerText: "London" }

    case "sentence-builder":
      // Reverse chunk order
      const chunkCount = chunks && Array.isArray(chunks) ? chunks.length : 0
      const reversed = Array.from({ length: chunkCount }, (_, i) => chunkCount - 1 - i)
      return { answerKeys: reversed }

    default:
      return { answerKey: 0 }
  }
}

;(async () => {
  const runId = Math.random().toString(36).slice(2, 8)
  const AV1 = `dicebear:adventurer:e2eav1${runId}`
  const AV2 = `dicebear:bottts:e2eav2${runId}`

  // ── 1: manager auth + config ──
  const mgr = connect("mgr", `e2e-mgr-${runId}`)
  await waitEvent(mgr, "mgr", "connect", null, 10000, "connect")
  step("mgr connected")
  const cfgP = waitEvent(mgr, "mgr", "manager:config", null, 10000)
  mgr.emit("manager:auth", PW)
  const cfg = await cfgP
  if (!cfg) {
    step("ABORT: no manager:config after auth")
    finish(2)
    return
  }
  step("mgr auth -> manager:config")

  // Pick a quizz from config (prefer multi-type fixtures)
  const quizzes = Array.isArray(cfg.quizz) ? cfg.quizz : []
  const pickMeta =
    quizzes.find((q) => q && q.id && q.id.includes("all-ty")) ||
    quizzes.find((q) => q && q.id === "python-basics") ||
    quizzes.find((q) => q && (q.questionCount > 0 || (Array.isArray(q.questions) && q.questions.length))) ||
    quizzes[0]

  if (!pickMeta || !pickMeta.id) {
    step("ABORT: no usable quizz in config")
    finish(2)
    return
  }

  let quiz = pickMeta
  if (!Array.isArray(quiz.questions) || !quiz.questions.length) {
    const qdP = waitEvent(mgr, "mgr", "quizz:data", null, 10000, "quizz:data")
    mgr.emit("quizz:get", pickMeta.id)
    const qd = await qdP
    if (qd && Array.isArray(qd.questions)) quiz = qd
  }

  const nQ = (quiz.questions || []).length
  note(`quizz picked: ${quiz.id} (${nQ} questions)`)
  if (!nQ) {
    step("ABORT: quizz has no questions (detail-fetch failed)")
    finish(2)
    return
  }

  const resultIdsBefore = new Set(
    (Array.isArray(cfg.results) ? cfg.results : []).map((r) => r && r.id),
  )
  note(`results in config before game: ${resultIdsBefore.size}`)

  // ── 2: game:create ──
  const createdP = waitEvent(mgr, "mgr", "manager:gameCreated", null, 10000)
  mgr.emit("game:create", quiz.id)
  const created = await createdP
  if (!created || !created.gameId || !created.inviteCode) {
    step("ABORT: game:create failed")
    finish(2)
    return
  }
  const { gameId, inviteCode } = created
  step(`game created gameId=${gameId}`)

  // ── 3: two players join + login + SET_AVATAR roundtrip ──
  async function joinPlayer(role, clientId, username, avatar) {
    const p = connect(role, clientId)
    await waitEvent(p, role, "connect", null, 10000, "connect")
    const roomP = waitEvent(p, role, "game:successRoom", null, 10000)
    p.emit("player:join", inviteCode)
    const room = await roomP
    if (!room) step(`${role}: NO game:successRoom`)

    const joinP = waitEvent(p, role, "game:successJoin", null, 10000)
    p.emit("player:login", { gameId, data: { username } })
    const joined = await joinP
    step(
      `${role} login -> successJoin=${Boolean(joined)} token=${joined && joined.playerToken ? "yes" : "no"}`,
    )
    await sleep(300)

    const marker = avatar.slice(-14)
    const npP = waitEvent(
      mgr,
      "mgr",
      "manager:newPlayer",
      (d) => JSON.stringify(d || null).includes(marker),
      10000,
      `manager:newPlayer(avatar ${role})`,
    )
    const lbP = waitEvent(
      p,
      role,
      "player:updateLeaderboard",
      (d) => JSON.stringify(d || null).includes(marker),
      10000,
      `player:updateLeaderboard(avatar ${role})`,
    )
    p.emit("player:setAvatar", { avatar })
    const [np, lb] = await Promise.all([npP, lbP])
    step(
      `${role} setAvatar roundtrip: managerNewPlayer=${Boolean(np)} roomLeaderboard=${Boolean(lb)}`,
    )
    return p
  }

  const p1 = await joinPlayer("p1", `e2e-p1-${runId}`, "E2E-Alice", AV1)
  const p2 = await joinPlayer("p2", `e2e-p2-${runId}`, "E2E-Bob", AV2)

  // ── 4: start game ──
  const sel1P = waitStatus(p1, "p1", ["SELECT_ANSWER"], 40000)
  const sel2P = waitStatus(p2, "p2", ["SELECT_ANSWER"], 40000)
  mgr.emit("manager:startGame", { gameId })
  step("manager:startGame emitted")

  // ── 5: question loop (manual advance) ──
  let selP1 = sel1P,
    selP2 = sel2P
  for (let qi = 0; qi < nQ; qi++) {
    const [s1, s2] = await Promise.all([selP1, selP2])
    if (!s1 && !s2) {
      step(
        `Q${qi + 1}: SELECT_ANSWER never reached either player — abort loop`,
      )
      break
    }
    step(
      `Q${qi + 1}: SELECT_ANSWER reached p1=${Boolean(s1)} p2=${Boolean(s2)}`,
    )

    const question = quiz.questions[qi] || {}
    const qType = question.type || "choice"
    note(`Q${qi + 1}: type=${qType}`)

    // Get per-type answers for both players
    const p1Ans = getP1Answer(question)
    const p2Ans = getP2Answer(question)

    // Arm result waits BEFORE answering (same as original driver)
    const r1P = waitStatus(p1, "p1", ["SHOW_RESULT"], 15000)
    const r2P = waitStatus(p2, "p2", ["SHOW_RESULT"], 15000)
    const respP = waitStatus(mgr, "mgr", ["SHOW_RESPONSES"], 15000)

    // Both players answer
    const w1 = waitStatus(p1, "p1", ["WAIT"], 10000)
    p1.emit("player:selectedAnswer", { gameId, data: p1Ans })
    const gotW1 = await w1

    const w2 = waitStatus(p2, "p2", ["WAIT"], 10000)
    p2.emit("player:selectedAnswer", { gameId, data: p2Ans })
    const gotW2 = await w2

    step(
      `Q${qi + 1}: answers submitted (p1 type=${qType} p2 type=${qType}) WAIT p1=${Boolean(gotW1)} p2=${Boolean(gotW2)}`,
    )

    // All answered -> results should follow
    const [r1, r2, resp] = await Promise.all([r1P, r2P, respP])
    const c1 = r1 && r1.data ? r1.data.correct : "n/a"
    const c2 = r2 && r2.data ? r2.data.correct : "n/a"
    step(
      `Q${qi + 1}: SHOW_RESULT p1.correct=${c1} p2.correct=${c2} mgrResponses=${Boolean(resp)}`,
    )

    const isLast = qi === nQ - 1
    if (isLast) {
      // Arm FINISHED waits before final showLeaderboard
      const f1P = waitStatus(p1, "p1", ["FINISHED"], 15000)
      const f2P = waitStatus(p2, "p2", ["FINISHED"], 15000)
      const fmP = waitStatus(mgr, "mgr", ["SHOW_ROUND_RECAP", "FINISHED"], 15000)
      mgr.emit("manager:showLeaderboard", { gameId })
      let fm = await fmP
      if (fm && fm.name === "SHOW_ROUND_RECAP") {
        step("final: got SHOW_ROUND_RECAP first, advancing again")
        const fm2P = waitStatus(mgr, "mgr", ["FINISHED"], 15000)
        mgr.emit("manager:showLeaderboard", { gameId })
        fm = await fm2P
      }
      let [f1, f2] = await Promise.all([f1P, f2P])
      if (!fm && !f1 && !f2) {
        note("no FINISHED after final showLeaderboard — retrying once (diagnostic)")
        const rf1 = waitStatus(p1, "p1", ["FINISHED"], 6000)
        const rfm = waitStatus(mgr, "mgr", ["FINISHED"], 6000)
        mgr.emit("manager:showLeaderboard", { gameId })
        const [rf1v, rfmv] = await Promise.all([rf1, rfm])
        note(`retry showLeaderboard -> FINISHED mgr=${Boolean(rfmv)} p1=${Boolean(rf1v)}`)
        if (rfmv) fm = rfmv
        if (rf1v) f1 = rf1v
      }
      step(
        `FINISHED mgr=${Boolean(fm && fm.name === "FINISHED")} p1=${Boolean(f1)} p2=${Boolean(f2)}`,
      )
    } else {
      const lbP = waitStatus(
        mgr,
        "mgr",
        ["SHOW_ROUND_RECAP", "SHOW_LEADERBOARD"],
        10000,
      )
      mgr.emit("manager:showLeaderboard", { gameId })
      let lb = await lbP
      if (lb && lb.name === "SHOW_ROUND_RECAP") {
        step(`Q${qi + 1}: SHOW_ROUND_RECAP interposed, advancing to leaderboard`)
        const lb2P = waitStatus(mgr, "mgr", ["SHOW_LEADERBOARD"], 10000)
        mgr.emit("manager:showLeaderboard", { gameId })
        lb = await lb2P
      }
      step(
        `Q${qi + 1}: SHOW_LEADERBOARD=${Boolean(lb && lb.name === "SHOW_LEADERBOARD")}`,
      )
      // Prepare for next question
      selP1 = waitStatus(p1, "p1", ["SELECT_ANSWER"], 20000)
      selP2 = waitStatus(p2, "p2", ["SELECT_ANSWER"], 20000)
      mgr.emit("manager:nextQuestion", { gameId })
    }
  }

  // ── 6: results persistence check ──
  await sleep(700)
  const cfg2P = waitEvent(
    mgr,
    "mgr",
    "manager:config",
    null,
    10000,
    "manager:config(after FINISHED)",
  )
  mgr.emit("manager:getConfig")
  const cfg2 = await cfg2P
  let newResultIds = []
  if (cfg2 && Array.isArray(cfg2.results)) {
    newResultIds = cfg2.results
      .map((r) => r && r.id)
      .filter((id) => id && !resultIdsBefore.has(id))
    step(`results persistence: ${newResultIds.length} new result(s) in config: ${newResultIds.join(",")}`)
  } else {
    step(
      `results persistence: config missing/has no results array (cfg2=${Boolean(cfg2)})`,
    )
  }
  log.newResultIds = newResultIds

  if (newResultIds.length > 0) {
    const rid = newResultIds[0]
    const rdP = waitEvent(mgr, "mgr", "results:data", null, 10000, "results:data")
    mgr.emit("results:get", rid)
    const rd = await rdP
    step(
      `results:get -> results:data=${Boolean(rd)} players=${rd && Array.isArray(rd.players) ? rd.players.length : "n/a"} questions=${rd && Array.isArray(rd.questions) ? rd.questions.length : "n/a"}`,
    )

    // Cleanup: RESULTS.DELETE
    for (const del of newResultIds) {
      const delCfgP = waitEvent(
        mgr,
        "mgr",
        "manager:config",
        (d) =>
          d &&
          Array.isArray(d.results) &&
          !d.results.some((r) => r && r.id === del),
        10000,
        `manager:config(result ${del} deleted)`,
      )
      mgr.emit("results:delete", del)
      const ok = await delCfgP
      step(`results:delete ${del} -> confirmed-gone=${Boolean(ok)}`)
    }
  }

  // ── 7: endGame cleanup ──
  const resetMgrP = waitEvent(mgr, "mgr", "game:reset", null, 10000, "game:reset(mgr)")
  const resetP1P = waitEvent(p1, "p1", "game:reset", null, 10000, "game:reset(p1)")
  mgr.emit("manager:endGame", { gameId })
  const [rm, rp] = await Promise.all([resetMgrP, resetP1P])
  step(`endGame -> game:reset mgr=${Boolean(rm)} p1=${Boolean(rp)}`)

  await sleep(300)
  p1.close()
  p2.close()
  mgr.close()
  finish(0)

  function finish(code) {
    log.finishedAt = new Date().toISOString()
    log.gapCount = log.gaps.length
    fs.writeFileSync(OUT, JSON.stringify(log, null, 1))
    console.log(`WROTE ${OUT} events=${log.events.length} gaps=${log.gaps.length}`)
    setTimeout(() => process.exit(code), 200)
  }
})().catch((e) => {
  log.crash = String((e && e.stack) || e)
  try {
    fs.writeFileSync(OUT, JSON.stringify(log, null, 1))
  } catch (_) {}
  console.error("E2E CRASH", e)
  process.exit(2)
})
