import type { IncomingMessage, ServerResponse } from "http"
import fs from "fs"
import { getResultById } from "@razzoozle/socket/services/config"

// ── per-result Open Graph unfurl (/r/:id) ───────────────────────────────────
// Crawlers fetch /r/:id and read the og:* meta tags. Without this every share
// link previews identically (the static SPA shell). We serve the SAME built
// index.html (so humans get a working app) but rewrite og:title/og:description/
// <title> with this result's winner. Best-effort: a missing result or an
// unreadable file MUST NOT break the page — we always end up serving valid SPA
// HTML (or a 302 to / only when the shell itself is unreadable).
const OG_INDEX_HTML = "/app/web/index.html" // nginx root in the prod image (Dockerfile: COPY web/dist -> /app/web)

const escHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const injectOg = (html: string, title: string, desc: string): string =>
  html
    .replace(
      /(<meta property="og:title" content=")[^"]*(")/i,
      `$1${escHtml(title)}$2`,
    )
    .replace(
      /(<meta property="og:description" content=")[^"]*(")/i,
      `$1${escHtml(desc)}$2`,
    )
    .replace(/(<title>)[^<]*(<\/title>)/i, `$1${escHtml(title)}$2`)

export const handleResultOg = (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  let html: string
  try {
    html = fs.readFileSync(OG_INDEX_HTML, "utf-8")
  } catch {
    // The SPA shell itself is unreadable (misconfigured image): bounce to /.
    res.writeHead(302, { Location: "/" })
    res.end()
    return
  }

  try {
    const result = getResultById(id ?? "")
    const winner = result.players?.[0]
    const subject = result.subject || "Razzoozle"
    const title = winner ? `${subject} — ${winner.username} gewinnt!` : subject
    const desc = winner
      ? `${winner.username} gewinnt mit ${winner.points} Punkten. Spiel selbst auf Razzoozle.`
      : "Endstand auf Razzoozle — spiel selbst mit."
    html = injectOg(html, title, desc)
  } catch {
    // Unknown/corrupt id: serve the SPA shell unchanged (renders not-found) with
    // its default og tags. Never throws past here.
  }

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  })
  res.end(html)
}
