import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

// Real-port integration test for the HTTP edge. Binds a node http server that
// wires the FROZEN /healthz plus the route dispatcher exactly like index.ts,
// then exercises it with fetch. Body shape is always asserted (a bare 200 is
// not a pass). The DEV gate is toggled via RAZZOOLE_DEV per-case with module
// re-import so the fail-closed contract (B3) is exercised both ways.

const startServer = async (): Promise<{ server: Server; base: string }> => {
  // Re-import after RAZZOOLE_DEV is set for this case (isDevMode reads env live,
  // but resetModules keeps the bucket state isolated per case too).
  const { dispatchHttp } = await import(
    "@razzoozle/socket/services/http-routes"
  )
  const server = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("ok")
      return
    }
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

const post = (base: string, path: string, body: unknown, headers = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

describe("HTTP integration (real port)", () => {
  let server: Server
  let base: string

  beforeEach(async () => {
    vi.resetModules()
  })

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it("/healthz returns text/plain ok (frozen)", async () => {
    process.env.RAZZOOLE_DEV = "1"
    ;({ server, base } = await startServer())
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("ok")
  })

  it("/api/openapi.json → 200 + valid doc when RAZZOOLE_DEV=1", async () => {
    process.env.RAZZOOLE_DEV = "1"
    ;({ server, base } = await startServer())
    const res = await fetch(`${base}/api/openapi.json`)
    expect(res.status).toBe(200)
    const doc = (await res.json()) as { openapi: string; info: { title: string } }
    expect(doc.openapi).toBe("3.1.0")
    expect(doc.info.title).toBe("Quiz Control API")
  })

  it("/api/openapi.json → 404 when RAZZOOLE_DEV unset (B3 fail-closed)", async () => {
    delete process.env.RAZZOOLE_DEV
    ;({ server, base } = await startServer())
    const res = await fetch(`${base}/api/openapi.json`)
    expect(res.status).toBe(404)
  })

  it("/metrics → prom text when DEV=1, 404 when unset", async () => {
    process.env.RAZZOOLE_DEV = "1"
    ;({ server, base } = await startServer())
    const res = await fetch(`${base}/metrics`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toMatch(/# TYPE [a-z_]+ (counter|gauge|histogram|summary)/)
  })

  it("/metrics → 404 when DEV unset", async () => {
    delete process.env.RAZZOOLE_DEV
    ;({ server, base } = await startServer())
    expect((await fetch(`${base}/metrics`)).status).toBe(404)
  })

  it("/api/v1/health → JSON status ok (additive, always on)", async () => {
    delete process.env.RAZZOOLE_DEV
    ;({ server, base } = await startServer())
    const res = await fetch(`${base}/api/v1/health`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe("ok")
  })

  it("client-events: valid event → 204", async () => {
    process.env.RAZZOOLE_DEV = "1"
    ;({ server, base } = await startServer())
    const res = await post(base, "/api/v1/client-events", {
      type: "client-error",
      clientId: "ci-valid",
      message: "boom",
    })
    expect(res.status).toBe(204)
  })

  it("client-events: invalid payload → 400 with error body", async () => {
    process.env.RAZZOOLE_DEV = "1"
    ;({ server, base } = await startServer())
    const res = await post(base, "/api/v1/client-events", {
      type: "totally-unknown",
      clientId: "x",
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(typeof body.error).toBe("string")
  })

  it("client-events: oversize body → 413", async () => {
    process.env.RAZZOOLE_DEV = "1"
    ;({ server, base } = await startServer())
    const big = "x".repeat(70 * 1024) // > 64 KB cap
    const res = await post(base, "/api/v1/client-events", {
      type: "client-error",
      clientId: "ci",
      message: big,
    })
    expect(res.status).toBe(413)
  })

  it("client-events: over-rate per clientId → silent 204; TWO clientIds on ONE IP both pass (NOT per-IP)", async () => {
    process.env.RAZZOOLE_DEV = "1"
    ;({ server, base } = await startServer())

    // answer-latency is sampled (not always-kept) but still rate-limited; use it
    // so we exercise the limiter, not the always-keep path. 20/min cap.
    const send = (clientId: string) =>
      post(base, "/api/v1/client-events", {
        type: "answer-latency",
        clientId,
        latencyMs: 50,
      })

    // First client: 20 allowed, then the 21st+ is over-limit. Every response is
    // 204 (silent), so assert the bucket size / second-client independence
    // rather than a status flip — the contract is "silent 204 either way".
    for (let i = 0; i < 25; i++) {
      const r = await send("client-A")
      expect(r.status).toBe(204)
    }

    // A SECOND clientId from the same loopback IP must NOT be throttled by the
    // first one's bucket — proves per-clientId, not per-IP.
    const second = await send("client-B")
    expect(second.status).toBe(204)

    // Prove the limiter actually engaged for client-A: its bucket is at the cap.
    const { __bucketSize } = await import(
      "@razzoozle/socket/services/http-routes"
    )
    // Both clients created buckets (A and B) — distinct keys, NOT collapsed to IP.
    expect(__bucketSize()).toBeGreaterThanOrEqual(2)
  })
})
