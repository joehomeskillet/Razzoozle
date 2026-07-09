// Live-DB regression test for the P3 read-after-write race (see
// services/config/solo-results.ts `appendSoloResult` + services/http/solo.ts
// `handleSoloScore`). Pre-fix, appendSoloResult's Postgres mirror write was
// fire-and-forget: under DATABASE_MODE=pg, handleSoloScore's same-request
// leaderboard read-back (readSoloResults -> listSoloResultsPg) could race the
// uncommitted insert and come back stale/empty. The fix awaits the mirror
// before the read-back, so this test exercises the REAL HTTP handler against
// the REAL razzoozle Postgres to prove the fix end-to-end (not just a
// typecheck). Skips itself when DATABASE_URL isn't set — same house style as
// services/storage/__tests__/quizz-pg.test.ts.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Pool } from "pg"

const DATABASE_URL = process.env.DATABASE_URL
const describeRealDb = DATABASE_URL ? describe : describe.skip

const PREFIX = `soloracetest-${Date.now()}`
const quizzId = `${PREFIX}-quiz`

const post = (base: string, requestPath: string, body: unknown) =>
  fetch(`${base}${requestPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

describeRealDb(
  "handleSoloScore read-after-write (real Postgres, DATABASE_MODE=pg)",
  () => {
    let rawPool: Pool
    let server: Server
    let base: string
    let tmpConfigDir: string
    let prevDatabaseMode: string | undefined

    beforeAll(async () => {
      rawPool = new Pool({ connectionString: DATABASE_URL })

      // File writes still happen alongside the PG mirror (unchanged behavior)
      // — point them at an isolated tmp dir so this test never touches a real
      // config volume.
      tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "solo-race-cfg-"))
      process.env.CONFIG_PATH = tmpConfigDir
      prevDatabaseMode = process.env.DATABASE_MODE
      process.env.DATABASE_MODE = "pg"

      vi.resetModules()

      // Seed the quiz directly into Postgres (bypassing the file layer) so
      // handleSoloScore's readQuizzById (pg-native under DATABASE_MODE=pg)
      // finds it.
      const { updateQuizzPg } = await import(
        "@razzoozle/socket/services/storage/quizz-pg"
      )
      await updateQuizzPg(quizzId, {
        subject: "Solo race test",
        questions: [
          {
            question: "2+2?",
            type: "choice",
            answers: ["3", "4"],
            solutions: [1],
            cooldown: 5,
            time: 15,
          },
        ],
      })

      const { dispatchHttp } = await import(
        "@razzoozle/socket/services/http-routes"
      )
      server = createServer((req, res) => {
        if (dispatchHttp(req, res)) {
          return
        }
        res.writeHead(404)
        res.end()
      })
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      )
      const { port } = server.address() as AddressInfo
      base = `http://127.0.0.1:${port}`
    })

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rawPool.query(`DELETE FROM solo_results WHERE quiz_id = $1`, [
        quizzId,
      ])
      await rawPool.query(`DELETE FROM quizzes WHERE id = $1`, [quizzId])
      await rawPool.end()

      if (prevDatabaseMode === undefined) {
        delete process.env.DATABASE_MODE
      } else {
        process.env.DATABASE_MODE = prevDatabaseMode
      }
      delete process.env.CONFIG_PATH
      fs.rmSync(tmpConfigDir, { recursive: true, force: true })
    })

    it("returns the just-submitted entry in the same-request leaderboard (no stale/empty read)", async () => {
      const res = await post(base, `/api/quizz/${quizzId}/solo-score`, {
        playerName: "RaceWinner",
        score: 1000,
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        leaderboard: { playerName: string; score: number }[]
      }
      expect(
        body.leaderboard.some((entry) => entry.playerName === "RaceWinner"),
      ).toBe(true)
    })
  },
)
