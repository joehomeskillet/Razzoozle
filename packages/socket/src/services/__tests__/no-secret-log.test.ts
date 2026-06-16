import { describe, it, expect } from "vitest"
import { Writable } from "node:stream"
import { createLogger } from "@razzoozle/socket/services/logger"

// In-memory pino destination capturing every emitted JSON line.
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

describe("redaction (SECURITY-BLOCKER 1) — no raw secret in stdout JSON", () => {
  it("redacts password / managerPassword / apiKey / token / dataUrl / baseUrl", () => {
    const { stream, lines } = makeSink()
    const log = createLogger(stream)

    const PW = "SuperSecret-PW-7f3a"
    const MGR = "MgrPass-9001"
    const KEY = "sk-live-abcdef0123456789"
    const TOK = "bearer-tok-zzz"
    const DATA = "data:image/png;base64,AAAABBBBCCCC"
    const BASE = "https://secret-internal-host.example/api"

    // Shape mirrors MANAGER.AUTH(password) and AI.SET_KEY(key) args.
    log.info({ password: PW }, "manager-auth")
    log.info({ managerPassword: MGR }, "manager-auth-2")
    log.info({ apiKey: KEY, baseUrl: BASE }, "ai-set-key")
    log.info({ args: { token: TOK, dataUrl: DATA } }, "nested")

    const all = lines.join("\n")
    for (const secret of [PW, MGR, KEY, TOK, DATA, BASE]) {
      expect(all).not.toContain(secret)
    }
    // Confirm the censor token IS present (redaction actually fired).
    expect(all).toContain("[REDACTED]")
  })

  it("redacts solution fields of a full question payload", () => {
    const { stream, lines } = makeSink()
    const log = createLogger(stream)

    const question = {
      question: "Capital of France?",
      type: "quiz",
      answers: ["Paris", "Lyon", "Nice"],
      solutions: [0],
      correct: 0,
      acceptedAnswers: ["paris"],
      answerText: "Paris",
    }
    log.info({ question }, "question-loaded")

    const all = lines.join("\n")
    // The presentational fields are fine; the solution fields must be censored.
    expect(all).toContain("Capital of France?")
    expect(all).not.toContain('"solutions":[0]')
    expect(all).not.toContain('"acceptedAnswers":["paris"]')
    // `correct`/`answerText` keys are present but censored, not raw.
    expect(all).toContain("[REDACTED]")
  })

  it("redaction survives at one level of nesting (*.password)", () => {
    const { stream, lines } = makeSink()
    const log = createLogger(stream)
    log.info({ payload: { password: "nested-pw-xyz" } }, "nested-auth")
    expect(lines.join("\n")).not.toContain("nested-pw-xyz")
  })
})
