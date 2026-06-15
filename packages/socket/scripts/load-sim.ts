// CLI load script — spawns N REAL socket.io clients that join a game and answer
// each question with a RANDOM answer after a random delay. Unlike the server-
// side sim bots, these clients never receive solutions (anti-cheat), so their
// answers are inherently random — this is a TRANSPORT / LOAD / CI probe, not a
// correctness aid. It needs NO server sim-mode flag (they are ordinary clients).
//
// Usage:
//   tsx scripts/load-sim.ts --url http://localhost:3000 --code 123456 -n 50
//   tsx scripts/load-sim.ts --code 123456 -n 600 --correct 0.0
//
// Args:
//   --url      socket.io server URL          (default http://localhost:3000)
//   --code     6-digit invite code           (required)
//   -n         number of clients to spawn     (default 50)
//   --correct  documented-only knob; clients have NO solutions so it is ignored
//              for scoring (kept for parity with the server sim's CORRECT_RATE).
import { EVENTS } from "@razzoozle/common/constants"
import { STATUS } from "@razzoozle/common/types/game/status"
import { nanoid } from "nanoid"
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client"

interface Args {
  url: string
  code: string
  count: number
  correct: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    url: "http://localhost:3000",
    code: "",
    count: 50,
    correct: 0,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const next = argv[i + 1]

    if (flag === "--url" && next !== undefined) {
      args.url = next
      i += 1
    } else if (flag === "--code" && next !== undefined) {
      args.code = next
      i += 1
    } else if (flag === "-n" && next !== undefined) {
      args.count = Number.parseInt(next, 10)
      i += 1
    } else if (flag === "--correct" && next !== undefined) {
      args.correct = Number.parseFloat(next)
      i += 1
    }
  }

  return args
}

// Status payload for a SELECT_ANSWER frame (the only fields this probe reads).
interface SelectAnswerData {
  time?: number
  answers?: string[]
  type?: string
  min?: number
  max?: number
}

function spawnClient(args: Args, index: number): ClientSocket {
  const clientId = `load:${nanoid()}`
  // Username must be 4–20 chars (usernameValidator). Pad the index so even a
  // single-digit index satisfies the min-length.
  const username = `load-${String(index).padStart(4, "0")}`

  const socket: ClientSocket = ioClient(args.url, {
    transports: ["websocket"],
    auth: { clientId },
    reconnection: false,
    forceNew: true,
  })

  let gameId = ""

  socket.on("connect", () => {
    socket.emit(EVENTS.PLAYER.JOIN, args.code)
  })

  socket.on(EVENTS.GAME.SUCCESS_ROOM, (id: string) => {
    gameId = id
    socket.emit(EVENTS.PLAYER.LOGIN, { gameId, data: { username } })
  })

  socket.on(
    EVENTS.GAME.STATUS,
    (frame: { name: string; data: SelectAnswerData }) => {
      if (frame.name !== STATUS.SELECT_ANSWER) {
        return
      }

      const data = frame.data
      const timeSec = typeof data.time === "number" ? data.time : 15
      // Answer somewhere within the first 85% of the window so it lands in time.
      const delay = Math.floor(Math.random() * timeSec * 1000 * 0.85)

      // Random answer key: a choice index for choice/boolean/poll, or a random
      // value in [min,max] for a slider. Clients NEVER see solutions/correct.
      let answerKey = 0

      if (data.type === "slider") {
        const min = typeof data.min === "number" ? data.min : 0
        const max = typeof data.max === "number" ? data.max : 100
        answerKey = Math.round(min + Math.random() * (max - min))
      } else {
        const total = data.answers?.length ?? 4
        answerKey = Math.floor(Math.random() * total)
      }

      setTimeout(() => {
        socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
          gameId,
          data: { answerKey },
        })
      }, delay)
    },
  )

  socket.on(EVENTS.GAME.RESET, (msg: string) => {
    console.log(`[${username}] reset: ${msg}`)
    socket.disconnect()
  })

  return socket
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))

  if (!args.code) {
    console.error("Missing --code <6-digit invite code>. See header for usage.")
    process.exit(1)
  }

  console.log(
    `Spawning ${args.count} load clients against ${args.url} (code ${args.code}).\n` +
      "NOTE: these are real clients with NO solutions — answers are random " +
      "(--correct is documented-only and does not affect scoring).",
  )

  const sockets: ClientSocket[] = []

  for (let i = 0; i < args.count; i += 1) {
    sockets.push(spawnClient(args, i))
  }

  const shutdown = () => {
    console.log("\nDisconnecting load clients…")

    for (const s of sockets) {
      s.disconnect()
    }

    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main()
