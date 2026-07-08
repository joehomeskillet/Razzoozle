import type { ServerResponse } from "http"

// ── HTTP helpers (reused verbatim from the legacy router) ───────────────────
export const jsonOk = (res: ServerResponse, data: unknown): void => {
  const body = JSON.stringify(data)
  res.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

export const jsonError = (
  res: ServerResponse,
  status: number,
  message: string,
): void => {
  const body = JSON.stringify({ error: message })
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

// Plain-text attachment response (used by the log-download endpoints). The
// Content-Disposition makes the browser save the body instead of rendering it.
export const textAttachment = (
  res: ServerResponse,
  filename: string,
  body: string,
): void => {
  const buf = Buffer.from(body, "utf-8")
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "content-disposition": `attachment; filename="${filename}"`,
    "content-length": buf.byteLength,
  })
  res.end(buf)
}
