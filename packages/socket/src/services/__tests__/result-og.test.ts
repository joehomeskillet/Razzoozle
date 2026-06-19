import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Real-port integration test for the per-result Open Graph unfurl (GET /r/:id).
// Mirrors http-integration.test.ts: binds a node http server wiring the route
// dispatcher exactly like index.ts, then exercises it with fetch. handleResultOg
// reads the built SPA shell from OG_INDEX_HTML ("/app/web/index.html") and
// rewrites og:title / og:description / <title> with the result's winner via
// injectOg + escHtml. We seed that shell on disk so the inject path runs, and a
// result whose subject + winner username carry HTML-significant chars, then
// assert escHtml escaped them inside those meta tags. config.ts captures
// process.env.CONFIG_PATH ONCE at import time, so we set it (and reset modules)
// BEFORE startServer dynamically imports http-routes → config.

// The prod image path handleResultOg reads (see http-routes OG_INDEX_HTML).
const OG_INDEX_HTML = "/app/web/index.html"

// A minimal SPA shell with the three rewrite targets (default og tags). Mirrors
// what the build emits closely enough for the regex replacements in injectOg.
const SHELL_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Razzoozle</title>
<meta property="og:title" content="Razzoozle" />
<meta property="og:description" content="Spiel selbst auf Razzoozle." />
</head>
<body><div id="root"></div></body>
</html>`

const startServer = async (): Promise<{ server: Server; base: string }> => {
  // Re-import after CONFIG_PATH is set for this case so config.ts captures the
  // fresh temp root (it reads the env once at module load).
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

const writeResult = (root: string, id: string, contents: unknown): void => {
  const resultsDir = path.join(root, "results")
  fs.mkdirSync(resultsDir, { recursive: true })
  fs.writeFileSync(
    path.join(resultsDir, `${id}.json`),
    JSON.stringify(contents),
  )
}

// Extract the content="" value of a <meta property="<prop>"> tag from served HTML.
const metaContent = (html: string, prop: string): string => {
  const m = new RegExp(
    `<meta property="${prop}" content="([^"]*)"`,
    "i",
  ).exec(html)
  return m?.[1] ?? ""
}

const titleText = (html: string): string =>
  /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? ""

describe("per-result OG unfurl /r/:id (real port)", () => {
  let server: Server
  let base: string
  let tmpDir: string
  let prevConfigPath: string | undefined
  let shellPreexisted = false

  beforeEach(() => {
    vi.resetModules()
    prevConfigPath = process.env.CONFIG_PATH
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-og-test-"))
    process.env.CONFIG_PATH = tmpDir

    // Seed the SPA shell handleResultOg reads. Only create it if it does not
    // already exist (never clobber a real built shell), and only remove it in
    // teardown when WE created it.
    shellPreexisted = fs.existsSync(OG_INDEX_HTML)
    if (!shellPreexisted) {
      fs.mkdirSync(path.dirname(OG_INDEX_HTML), { recursive: true })
      fs.writeFileSync(OG_INDEX_HTML, SHELL_HTML, "utf-8")
    }
    // Silence config.ts saveResult diagnostic logs if any path logs.
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    if (!shellPreexisted && fs.existsSync(OG_INDEX_HTML)) {
      fs.rmSync(OG_INDEX_HTML, { force: true })
    }
    if (prevConfigPath === undefined) {
      delete process.env.CONFIG_PATH
    } else {
      process.env.CONFIG_PATH = prevConfigPath
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("escapes HTML-significant subject/winner chars in og:title, og:description and <title>", async () => {
    // Subject carries a raw <script> and the winner username a double-quote — if
    // injected unescaped these would break out of the meta attribute / inject a
    // script tag. escHtml must neutralize them.
    const subject = `<script>alert(1)</script>`
    const winnerName = `Eve"Onslaught`
    writeResult(tmpDir, "share123", {
      id: "share123",
      subject,
      date: "2026-06-19T00:00:00.000Z",
      players: [
        { username: winnerName, points: 4200, rank: 1 },
        { username: "bob", points: 100, rank: 2 },
      ],
      questions: [{ anything: true }],
    })
    ;({ server, base } = await startServer())

    const res = await fetch(`${base}/r/share123`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toMatch(/text\/html/i)
    const html = await res.text()

    const ogTitle = metaContent(html, "og:title")
    const ogDesc = metaContent(html, "og:description")
    const docTitle = titleText(html)

    // The escaped entities are present in each rewritten tag.
    expect(ogTitle).toContain("&lt;script&gt;")
    expect(ogTitle).toContain("&quot;")
    expect(docTitle).toContain("&lt;script&gt;")
    expect(docTitle).toContain("&quot;")
    // og:description is built from the winner name (escaped quote).
    expect(ogDesc).toContain("&quot;")
    expect(ogDesc).toContain("4200")

    // The RAW dangerous chars must NOT appear inside the rewritten tag values:
    // no live <script> and no attribute-breaking bare double-quote.
    expect(ogTitle).not.toContain("<script>")
    expect(ogTitle).not.toContain('"Onslaught')
    expect(docTitle).not.toContain("<script>")
    expect(ogDesc).not.toContain('"Onslaught')
  })

  it("serves the SPA shell (2xx, not 500) for an unknown result id", async () => {
    // No result file seeded → getResultById throws inside handleResultOg's inner
    // try, which is swallowed; the unmodified shell is served with default tags.
    ;({ server, base } = await startServer())

    const res = await fetch(`${base}/r/doesnotexist`)
    expect(res.status).toBe(200)
    expect(res.status).not.toBe(500)
    const html = await res.text()
    // Fallback shell keeps its default og:title (no result-specific rewrite).
    expect(metaContent(html, "og:title")).toBe("Razzoozle")
    expect(html).toContain('<div id="root">')
  })
})
