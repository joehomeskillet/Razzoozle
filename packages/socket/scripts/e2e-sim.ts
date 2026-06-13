// Standalone E2E driver — drives the rahoot socket server as a MANAGER over
// socket.io-client to verify the sim-mode bot feature end-to-end against a
// running container. Unlike load-sim.ts (which spawns many real *player*
// clients), this is a single *manager* socket that authenticates, creates a
// game, injects server-side sim bots, starts the game, and advances a few
// rounds — asserting the bot roster fills and the round lifecycle ticks.
//
// Event names / status->action mapping are the canonical ones the web manager
// uses (packages/web/src/features/game/utils/constants.ts MANAGER_SKIP_EVENTS):
//   SHOW_ROOM        -> START_GAME      (we send START_GAME explicitly in step 6)
//   SHOW_RESPONSES   -> SHOW_LEADERBOARD
//   SHOW_LEADERBOARD -> NEXT_QUESTION
// The manager receives every status frame on EVENTS.GAME.STATUS as { name, data }
// (Game.broadcastStatus / Game.sendStatus, index.ts:235/251). EVENTS.MANAGER
// .STATUS_UPDATE exists in the EVENTS table but is currently unused by the
// server; we subscribe to it too so the probe stays correct if that changes.
//
// Usage:
//   tsx scripts/e2e-sim.ts --url http://127.0.0.1:3120 --password <pw> \
//     --quizz personalfest --bots 8
//
// Exit code: 0 iff auth+create+start succeeded AND newPlayerEventsSeen === bots.
// Any timeout, auth failure, or sim-mode-disabled gate -> non-zero with a clear
// message. A structured JSON summary is always printed last to stdout.
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client"

interface Args {
  url: string
  password: string
  quizz: string
  bots: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    url: "http://127.0.0.1:3120",
    password: "",
    quizz: "personalfest",
    bots: 8,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const next = argv[i + 1]

    if (flag === "--url" && next !== undefined) {
      args.url = next
      i += 1
    } else if (flag === "--password" && next !== undefined) {
      args.password = next
      i += 1
    } else if (flag === "--quizz" && next !== undefined) {
      args.quizz = next
      i += 1
    } else if (flag === "--bots" && next !== undefined) {
      args.bots = Number.parseInt(next, 10)
      i += 1
    }
  }

  return args
}

// Status frame shape the manager receives on EVENTS.GAME.STATUS.
interface StatusFrame {
  name: string
  data?: unknown
}

interface Summary {
  authOk: boolean
  gameId: string | null
  inviteCode: string | null
  botsRequested: number
  newPlayerEventsSeen: number
  started: boolean
  statusesSeen: string[]
  finalError: string | null
}

// Reject after `ms` with a labelled error so every wait fails fast (no hangs).
function deadline(ms: number, label: string): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(
      () => reject(new Error(`timeout after ${ms}ms waiting for ${label}`)),
      ms,
    )
  })
}

// Wait for ONE of several events. Resolves with { event, payload } for whichever
// fires first; rejects on the deadline. Listeners are always cleaned up.
function waitForAny(
  socket: ClientSocket,
  events: string[],
  ms: number,
  label: string,
): Promise<{ event: string; payload: unknown }> {
  return new Promise((resolve, reject) => {
    const handlers = new Map<string, (payload: unknown) => void>()

    const cleanup = () => {
      for (const [event, handler] of handlers) {
        socket.off(event, handler)
      }
    }

    for (const event of events) {
      const handler = (payload: unknown) => {
        cleanup()
        resolve({ event, payload })
      }

      handlers.set(event, handler)
      socket.on(event, handler)
    }

    deadline(ms, label).catch((err: Error) => {
      cleanup()
      reject(err)
    })
  })
}

async function run(args: Args): Promise<Summary> {
  const summary: Summary = {
    authOk: false,
    gameId: null,
    inviteCode: null,
    botsRequested: args.bots,
    newPlayerEventsSeen: 0,
    started: false,
    statusesSeen: [],
    finalError: null,
  }

  if (!args.password) {
    summary.finalError = "missing --password <pw>"

    return summary
  }

  const clientId = `e2e-mgr-${Math.random().toString(36).slice(2, 10)}`

  const socket: ClientSocket = ioClient(args.url, {
    transports: ["websocket"],
    auth: { clientId },
    reconnection: false,
    forceNew: true,
  })

  // Record every status frame we ever observe (both the unused MANAGER channel
  // and the real GAME.STATUS channel) for the summary + round driving.
  const recordStatus = (frame: StatusFrame | undefined) => {
    const name = frame?.name
    if (typeof name === "string") {
      summary.statusesSeen.push(name)
    }
  }
  socket.on(EVENTS.MANAGER.STATUS_UPDATE, recordStatus)
  socket.on(EVENTS.GAME.STATUS, recordStatus)

  try {
    // --- connect -----------------------------------------------------------
    await Promise.race([
      new Promise<void>((resolve) => socket.once("connect", () => resolve())),
      deadline(10000, "socket connect"),
    ])

    // --- 3. authenticate ---------------------------------------------------
    socket.emit(EVENTS.MANAGER.AUTH, args.password)
    const auth = await waitForAny(
      socket,
      [EVENTS.MANAGER.CONFIG, EVENTS.MANAGER.ERROR_MESSAGE],
      10000,
      "manager auth (CONFIG | ERROR_MESSAGE)",
    )

    if (auth.event === EVENTS.MANAGER.ERROR_MESSAGE) {
      summary.finalError = `auth failed: ${String(auth.payload)}`

      return summary
    }

    summary.authOk = true

    // --- 4. create game ----------------------------------------------------
    socket.emit(EVENTS.GAME.CREATE, args.quizz)
    const created = await waitForAny(
      socket,
      [EVENTS.MANAGER.GAME_CREATED, EVENTS.GAME.ERROR_MESSAGE],
      10000,
      "game created (GAME_CREATED | ERROR_MESSAGE)",
    )

    if (created.event === EVENTS.GAME.ERROR_MESSAGE) {
      summary.finalError = `game create failed: ${String(created.payload)}`

      return summary
    }

    const createdPayload = created.payload as {
      gameId?: string
      inviteCode?: string
    }
    summary.gameId = createdPayload.gameId ?? null
    summary.inviteCode = createdPayload.inviteCode ?? null

    if (!summary.gameId) {
      summary.finalError = "GAME_CREATED missing gameId"

      return summary
    }

    const gameId = summary.gameId

    // --- 5. add bots -------------------------------------------------------
    // Count NEW_PLAYER events over a ~3s window. addBots emits one NEW_PLAYER
    // per bot (player-manager.ts:63). A MANAGER.ERROR_MESSAGE here means the
    // env gate is OFF ("errors:manager.simModeDisabled") or the window is open.
    let simError: string | null = null

    const onNewPlayer = () => {
      summary.newPlayerEventsSeen += 1
    }
    const onManagerError = (msg: unknown) => {
      simError = String(msg)
    }

    socket.on(EVENTS.MANAGER.NEW_PLAYER, onNewPlayer)
    socket.on(EVENTS.MANAGER.ERROR_MESSAGE, onManagerError)

    // FLAT payload — matches SET_AUTO and the addBots handler (game.ts:136).
    socket.emit(EVENTS.MANAGER.ADD_BOTS, { gameId, count: args.bots })

    await new Promise((resolve) => setTimeout(resolve, 3000))

    socket.off(EVENTS.MANAGER.NEW_PLAYER, onNewPlayer)
    socket.off(EVENTS.MANAGER.ERROR_MESSAGE, onManagerError)

    if (simError) {
      summary.finalError = `sim-mode gate / addBots rejected: ${simError}`

      return summary
    }

    if (summary.newPlayerEventsSeen !== args.bots) {
      summary.finalError = `expected ${args.bots} NEW_PLAYER events, saw ${summary.newPlayerEventsSeen}`

      return summary
    }

    // --- 6. start game + drive ~3 rounds -----------------------------------
    // The manager advances per status using the canonical MANAGER_SKIP_EVENTS
    // mapping: after responses -> SHOW_LEADERBOARD, after a leaderboard ->
    // NEXT_QUESTION. We loop until FINISHED or we've completed ~3 questions.
    socket.emit(EVENTS.MANAGER.START_GAME, { gameId })
    summary.started = true

    const TARGET_QUESTIONS = 3
    let leaderboardsSeen = 0

    const driveStatus = (frame: StatusFrame | undefined) => {
      const name = frame?.name

      if (name === STATUS.SHOW_RESPONSES) {
        // Responses shown -> advance to the leaderboard.
        socket.emit(EVENTS.MANAGER.SHOW_LEADERBOARD, { gameId })
      } else if (name === STATUS.SHOW_LEADERBOARD) {
        leaderboardsSeen += 1
        // Leaderboard shown -> advance to the next question (unless we're done).
        if (leaderboardsSeen < TARGET_QUESTIONS) {
          socket.emit(EVENTS.MANAGER.NEXT_QUESTION, { gameId })
        }
      }
    }
    socket.on(EVENTS.GAME.STATUS, driveStatus)
    socket.on(EVENTS.MANAGER.STATUS_UPDATE, driveStatus)

    // Run the round loop until we've seen ~3 leaderboards / FINISHED, or a cap.
    // This is best-effort: the rounds tick on the server's own timers, so we
    // just give it a bounded budget and stop. Not reaching 3 rounds does NOT
    // fail the run (bot-add is the assertion); it's reflected in statusesSeen.
    await Promise.race([
      new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (
            leaderboardsSeen >= TARGET_QUESTIONS ||
            summary.statusesSeen.includes(STATUS.FINISHED)
          ) {
            clearInterval(check)
            resolve()
          }
        }, 250)
      }),
      // Generous bound: 3 questions * (time + cooldown) plus slack. Resolving
      // (not rejecting) on the bound keeps the run a success once bots passed.
      new Promise<void>((resolve) => setTimeout(resolve, 90000)),
    ])

    socket.off(EVENTS.GAME.STATUS, driveStatus)
    socket.off(EVENTS.MANAGER.STATUS_UPDATE, driveStatus)

    return summary
  } finally {
    socket.disconnect()
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  let summary: Summary

  try {
    summary = await run(args)
  } catch (err) {
    // Any timeout / unexpected throw -> a failing summary with the message.
    summary = {
      authOk: false,
      gameId: null,
      inviteCode: null,
      botsRequested: args.bots,
      newPlayerEventsSeen: 0,
      started: false,
      statusesSeen: [],
      finalError: err instanceof Error ? err.message : String(err),
    }
  }

  // Structured JSON summary — always the last line on stdout.
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)

  const ok =
    summary.authOk &&
    summary.started &&
    summary.finalError === null &&
    summary.newPlayerEventsSeen === summary.botsRequested

  process.exit(ok ? 0 : 1)
}

void main()
