import { describe, it, expect, beforeEach } from "vitest"
import {
  pushServerLog,
  pushClientLog,
  serverLogLines,
  clientLogLines,
  clear,
} from "@razzoozle/socket/services/log-buffer"

// The ring is a dumb store of already-serialized + already-redacted log LINES.
// Redaction happens UPSTREAM in the pino serializer (logger.ts), BEFORE a line
// ever reaches these buffers — so these tests only assert the bounded-ring
// mechanics and the server/client separation, plus that the buffer faithfully
// stores exactly what it is given (no secret is reintroduced here).

describe("log-buffer ring", () => {
  beforeEach(() => {
    clear()
  })

  it("caps at 2000 and drops the oldest lines", () => {
    for (let i = 0; i < 2100; i++) {
      pushServerLog(`line-${i}`)
    }

    const lines = serverLogLines()
    expect(lines.length).toBe(2000)
    // The oldest 100 (line-0 .. line-99) were dropped.
    expect(lines[0]).toBe("line-100")
    expect(lines[lines.length - 1]).toBe("line-2099")
  })

  it("keeps the server and client rings separate", () => {
    pushServerLog("S-only")
    pushClientLog("C-only")

    expect(serverLogLines()).toContain("S-only")
    expect(serverLogLines()).not.toContain("C-only")
    expect(clientLogLines()).toContain("C-only")
    expect(clientLogLines()).not.toContain("S-only")
  })

  it("strips a single trailing newline so NDJSON joins cleanly", () => {
    pushServerLog('{"a":1}\n')
    expect(serverLogLines()[0]).toBe('{"a":1}')
    expect(serverLogLines().join("\n")).toBe('{"a":1}')
  })

  it("ignores empty / whitespace-only lines", () => {
    pushServerLog("")
    pushServerLog("   ")
    pushServerLog("\n")
    expect(serverLogLines().length).toBe(0)
  })

  it("stores exactly what it is given (redaction is upstream)", () => {
    // Simulate a line the serializer has ALREADY redacted: the raw secret was
    // censored before it reached the buffer, so it can never appear here.
    pushServerLog('{"password":"[REDACTED]","msg":"manager-auth"}')

    const all = serverLogLines().join("\n")
    expect(all).not.toContain("SuperSecret-PW")
    expect(all).toContain("[REDACTED]")
  })
})
