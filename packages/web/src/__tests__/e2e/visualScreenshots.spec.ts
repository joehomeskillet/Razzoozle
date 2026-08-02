import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { expect, test } from "@playwright/test"
import { renderToString } from "react-dom/server"

import { FlowerBattlePresenterHud } from "../../experiences/flower-battle/FlowerBattlePresenterHud"

const VIEWPORTS = [
  { width: 1366, height: 768, label: "1366x768" },
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1600, height: 900, label: "1600x900" },
  { width: 1920, height: 1080, label: "1920x1080" },
] as const

const DPRS = [1, 2] as const

const OUTPUT_DIR = resolve(
  __dirname,
  "../flower-battle/__tests__/visual-output/fb-hud3",
)

const teams = [
  {
    name: "Team Alpha",
    members: ["a", "b"],
    hp: 0,
    shield: 0,
    effects: ["sunbeam"],
    growthStage: 2,
    sunPoints: 2,
  },
  {
    name: "Team Bravo",
    members: ["c", "d"],
    hp: 0,
    shield: 0,
    effects: ["acid_rain"],
    growthStage: 1,
    sunPoints: 1,
  },
  {
    name: "Team Charlie",
    members: ["e", "f"],
    hp: 0,
    shield: 0,
    effects: ["umbrella_shield"],
    growthStage: 1,
    sunPoints: 1,
  },
  {
    name: "Team Delta",
    members: ["g", "h"],
    hp: 0,
    shield: 0,
    effects: ["sunbeam"],
    growthStage: 3,
    sunPoints: 0,
  },
]

const staticMarkup = renderToString(
  <FlowerBattlePresenterHud
    variant="overlay"
    teams={teams}
    sunPoints={{ red: 2, blue: 1, green: 1, yellow: 0 }}
    answerCounter={{ answered: 4, total: 12 }}
    countdown={{ seconds: 45 }}
    powerUpChoiceMessage="Event banner active"
    powerUp={{ type: "acid_rain", teamName: "Team Charlie" }}
  />,
)

test("fixture marker exists for screenshot capture", () => {
  expect(staticMarkup).toContain('data-testid="flower-battle-presenter-hud"')
  expect(staticMarkup).toContain('data-testid="flower-battle-event-banner"')
})

test.describe("flower-battle presenter hud visual captures", () => {
  for (const viewport of VIEWPORTS) {
    for (const dpr of DPRS) {
      const subjectBase = `${viewport.label.replace(/x/g, "-")}-dpr-${dpr}`

      test(`viewport ${viewport.label} @ ${dpr}x`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: {
            width: viewport.width,
            height: viewport.height,
          },
          deviceScaleFactor: dpr,
        })
        const page = await context.newPage()

        try {
          const html = `
            <!doctype html>
            <html>
              <head>
                <meta charset="utf-8" />
                <style>
                  html,
                  body,
                  #root {
                    margin: 0;
                    width: 100%;
                    height: 100%;
                  }
                </style>
              </head>
              <body>
                <div id="root">${staticMarkup}</div>
              </body>
            </html>
          `

          await page.setContent(html, { waitUntil: "domcontentloaded" })
          const hudLocator = page.getByTestId("flower-battle-presenter-hud")
          await expect(hudLocator).toBeVisible()

          mkdirSync(OUTPUT_DIR, { recursive: true })

          try {
            await expect(hudLocator).toHaveScreenshot(`${subjectBase}.png`, {
              animations: "disabled",
              maxDiffPixelRatio: 0.01,
              timeout: 15_000,
            })
          } catch (error) {
            if (!String(error).includes("No snapshot")) {
              throw error
            }
          }

          await hudLocator.screenshot({
            path: resolve(OUTPUT_DIR, subjectBase + ".png"),
          })
        } finally {
          await page.close()
          await context.close()
        }
      })
    }
  }
})
