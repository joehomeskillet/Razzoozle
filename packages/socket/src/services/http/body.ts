import type { IncomingMessage } from "http"

const BODY_LIMIT_BYTES = 64 * 1024 // 64 KB — enough for any valid payload
export const SKELETON_IMPORT_MAX = 16 * 1024 * 1024

export const readBody = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const tooLarge = () =>
      reject(Object.assign(new Error("Payload Too Large"), { status: 413 }))

    // Content-Length pre-check: reject WITHOUT destroying the socket (no body
    // bytes consumed yet) so the handler's catch can still write a real 413
    // response. Pause the stream so the (unread) body never accumulates.
    const contentLength = Number(req.headers["content-length"] ?? 0)
    if (contentLength > BODY_LIMIT_BYTES) {
      req.pause()
      tooLarge()
      return
    }

    const chunks: Buffer[] = []
    let accumulated = 0
    let aborted = false

    req.on("data", (chunk: Buffer) => {
      if (aborted) {
        return
      }
      accumulated += chunk.byteLength
      if (accumulated > BODY_LIMIT_BYTES) {
        // Chunked overflow (no/under-stated Content-Length): stop reading and
        // reject — the handler writes a 413 response, then the connection
        // closes cleanly once the response is flushed.
        aborted = true
        req.pause()
        tooLarge()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (aborted) {
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")))
      } catch {
        reject(new Error("Invalid JSON"))
      }
    })
    req.on("error", reject)
  })

export const readRawBody = (
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const tooLarge = () =>
      reject(Object.assign(new Error("Payload Too Large"), { status: 413 }))

    const contentLength = Number(req.headers["content-length"] ?? 0)
    if (contentLength > maxBytes) {
      req.pause()
      tooLarge()
      return
    }

    const chunks: Buffer[] = []
    let accumulated = 0
    let aborted = false

    req.on("data", (chunk: Buffer) => {
      if (aborted) {
        return
      }
      accumulated += chunk.byteLength
      if (accumulated > maxBytes) {
        aborted = true
        req.pause()
        tooLarge()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (aborted) {
        return
      }
      resolve(Buffer.concat(chunks))
    })
    req.on("error", reject)
  })

export const statusFrom413 = (err: unknown, fallback: number): number =>
  err instanceof Error &&
  (err as NodeJS.ErrnoException & { status?: number }).status === 413
    ? 413
    : fallback
