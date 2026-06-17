import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Writable } from "node:stream"
import { createLogger } from "@razzoozle/socket/services/logger"

// DEV_API_KEY auth layer in front of the DEV-gated HTTP routes. Mirrors the
// http-integration.test.ts pattern: a real node http server is bound on an
// ephemeral port, the dispatcher is re-imported per case (vi.resetModules) so
// isDevMode()/devApiKey() read the env live, and every case asserts the
// response BODY shape, not just the status. The fail-closed contract is:
//   dev off            -> 404 (do not reveal), even with DEV_API_KEY set
//   dev on  + key set  -> 401 { error: "unauthorized" } unless the X-Manager-Token
//                         header OR the ?token= query equals DEV_API_KEY
//   dev on  + no key   -> served (dev-gate only, unchanged)

const startServer = async (): Promise<{ server: Server; base: string }> => {
  const { dispatchHttp } =
    await import("@razzoozle/socket/services/http-routes")
  const server = createServer((req, res) => {
    if (dispatchHttp(req, res)) {
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return { server, base: `http://127.0.0.1:${port}` }
}

// In-memory pino destination (same shape as no-secret-log.test.ts).
const makeSink = () => {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const ln of chunk.toString("utf-8").split("\n")) {
        if (ln.trim()) {
          lines.push(ln)
        }
      }
      cb()
    },
  })
  return { stream, lines }
}

describe("DEV_API_KEY auth on dev-gated routes", () => {
  let server: Server
  let base: string

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(async () => {
    delete process.env.RAZZOOLE_DEV
    delete process.env.DEV_API_KEY
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  // ── CASE A: dev on + key set ──────────────────────────────────────────────
  it('no token → 401 { error: "unauthorized" }', async () => {
    process.env.RAZZOOLE_DEV = "1"
    process.env.DEV_API_KEY = "testkey"
    ;({ server, base } = await startServer())

    const res = await fetch(`${base}/api/openapi.json`)
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe("unauthorized")
  })

  it('wrong token → 401 { error: "unauthorized" }', async () => {
    process.env.RAZZOOLE_DEV = "1"
    process.env.DEV_API_KEY = "testkey"
    ;({ server, base } = await startServer())

    const res = await fetch(`${base}/api/openapi.json`, {
      headers: { "X-Manager-Token": "wrong" },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe("unauthorized")
  })

  it("correct X-Manager-Token header → 200 valid doc", async () => {
    process.env.RAZZOOLE_DEV = "1"
    process.env.DEV_API_KEY = "testkey"
    ;({ server, base } = await startServer())

    const res = await fetch(`${base}/api/openapi.json`, {
      headers: { "X-Manager-Token": "testkey" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { openapi?: string }
    expect(body.openapi).toBe("3.1.0")
  })

  it("correct ?token query → 200 valid doc", async () => {
    process.env.RAZZOOLE_DEV = "1"
    process.env.DEV_API_KEY = "testkey"
    ;({ server, base } = await startServer())

    const res = await fetch(`${base}/api/openapi.json?token=testkey`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { openapi?: string }
    expect(body.openapi).toBe("3.1.0")
  })

  // ── CASE B: dev on + key UNSET → dev-gate only (open) ──────────────────────
  it("dev on, no DEV_API_KEY → 200 without any token", async () => {
    process.env.RAZZOOLE_DEV = "1"
    delete process.env.DEV_API_KEY
    ;({ server, base } = await startServer())

    const res = await fetch(`${base}/api/openapi.json`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { openapi?: string }
    expect(body.openapi).toBe("3.1.0")
  })

  // ── CASE C: dev OFF + key set → 404 (dev-off wins, fail-closed) ────────────
  it("dev off wins → 404 even with DEV_API_KEY set", async () => {
    delete process.env.RAZZOOLE_DEV
    process.env.DEV_API_KEY = "testkey"
    ;({ server, base } = await startServer())

    const res = await fetch(`${base}/api/openapi.json`, {
      headers: { "X-Manager-Token": "testkey" },
    })
    expect(res.status).toBe(404)
  })

  // ── CASE D: the key never appears in a logged line (redaction) ────────────
  it("DEV_API_KEY never appears in a logged line (redaction)", () => {
    const { stream, lines } = makeSink()
    const log = createLogger(stream)

    const KEY = "secret-dev-key-abc123"
    log.info({ devApiKey: KEY }, "config")
    log.info({ config: { devApiKey: KEY } }, "nested")

    const all = lines.join("\n")
    expect(all).not.toContain(KEY)
    expect(all).toContain("[REDACTED]")
  })
})
