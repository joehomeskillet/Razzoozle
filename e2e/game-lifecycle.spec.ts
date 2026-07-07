// e2e/game-lifecycle.spec.ts — Playwright E2E SKELETON (structure only).
//
// enable: pnpm add -D @playwright/test
// (intentionally NOT added to package.json — see playwright.config.ts header).
//
// Every test below is `test.skip` until data-testid instrumentation lands on
// the web client (currently 0 hits — see scratchpad/RESEARCH-testing-cicd.md
// "Data-testid map required"). This file only pins down the STRUCTURE:
// two isolated browser contexts (host + player — NOT tabs, to avoid
// localStorage/client_id collision, per memory feedback), PIN handoff between
// them, and a backend matrix (node | rust) driven by localStorage.gameBackend
// (see packages/web/src/features/game/contexts/socket-context.tsx +
// features/manager/components/configurations/BackendPanel.tsx for the real
// mechanism this mirrors).
import { test, expect } from "@playwright/test"

const BACKENDS = ["node", "rust"] as const

for (const backend of BACKENDS) {
  test.describe(`Lifecycle [${backend}]`, () => {
    test.skip(`host + player: Q1 -> answer -> reveal -> leaderboard (${backend})`, async ({
      browser,
    }) => {
      // Two SEPARATE browser contexts (not just pages/tabs) so each side gets
      // its own localStorage/cookie jar — the app keys the player/manager
      // client identity off localStorage, sharing a context would collide.
      const hostCtx = await browser.newContext()
      const playerCtx = await browser.newContext()

      const host = await hostCtx.newPage()
      const player = await playerCtx.newPage()

      // Inject the backend choice BEFORE any app code runs (matches how
      // BackendPanel.tsx / socket-context.tsx read it on boot).
      await host.addInitScript(
        (b) => window.localStorage.setItem("gameBackend", b),
        backend,
      )
      await player.addInitScript(
        (b) => window.localStorage.setItem("gameBackend", b),
        backend,
      )

      let gamePin = ""

      await test.step("host: login + select quizz + start -> get PIN", async () => {
        // TODO: host.goto("/manager"), fill data-testid="login-password",
        // submit, pick a quizz, start the game.
        // TODO: gamePin = await host.getByTestId("game-pin").innerText()
        await host.goto("/manager")
      })

      await test.step("player: join with PIN -> waiting room", async () => {
        // TODO: player.goto("/"), fill data-testid="pin-input" with gamePin,
        // fill data-testid="player-name-input", submit, assert waiting state.
        await player.goto("/")
        expect(gamePin).toBeDefined() // placeholder assertion, replace in Phase 2
      })

      await test.step("host: start game -> both see Q1", async () => {
        // TODO: host clicks data-testid="quizz-start-btn" (or round-start
        // equivalent); assert host + player both render
        // data-testid="question-text" with the SAME text.
      })

      await test.step("player: submit an answer", async () => {
        // TODO: player.getByTestId("answer-btn-0").click(); assert
        // data-testid="answer-submitted" becomes visible.
      })

      await test.step("host: reveal -> player sees correct highlight", async () => {
        // TODO: host.getByTestId("reveal-btn").click(); assert
        // data-testid="correct-answer-highlight" on the player side.
      })

      await test.step("auto-advance -> leaderboard on both sides", async () => {
        // TODO: assert data-testid="leaderboard-table" (host) and
        // data-testid="leaderboard-row-{name}" (player) both show the
        // player's name + a persisted score > 0.
      })

      await hostCtx.close()
      await playerCtx.close()
    })
  })
}
