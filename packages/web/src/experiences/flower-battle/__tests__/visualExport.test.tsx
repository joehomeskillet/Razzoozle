/**
 * FB-HUD4 visual export — captures the Gartenmodus HUD at the three
 * acceptance viewports (1600×927, 1366×768, 1024×768) with 1–4 teams
 * and writes static HTML fixtures the design-validator / reviewers
 * can open in a browser. These fixtures are the visual evidence for
 * the SDD §11.4 (Visuelle Regression) acceptance criteria.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TEAMS } from "@razzoozle/common/constants"

import { FlowerBattlePresenterHud } from "../FlowerBattlePresenterHud"
import { FlowerGardenScene } from "../FlowerGardenScene"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const VIEWPORTS = [
  { label: "1600x927", width: 1600, height: 927 },
  { label: "1366x768", width: 1366, height: 768 },
  { label: "1024x768", width: 1024, height: 768 },
] as const

const fixturesDir = resolve(
  "/nvmetank1/projects/Razzoozle/source/.claude/worktrees/fb-hud4-garden-correction/scratchpad/fb-hud4-screenshots",
)
mkdirSync(fixturesDir, { recursive: true })

const wrap = (body: string, title: string, width: number, height: number): string => `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: linear-gradient(180deg, #dbe7d4 0%, #9ec48a 100%); font-family: system-ui, sans-serif; color: #1f2937; }
  .stage { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }
  .stage > * { position: absolute; inset: 0; }
</style>
</head>
<body>
<div class="stage">${body}</div>
</body>
</html>`

const buildTeams = (count: number): FlowerBattleTeamState[] =>
  Array.from({ length: count }, (_, index) => {
    const fallbackName = TEAMS[index] ?? `Team ${index + 1}`
    return {
      name: fallbackName,
      members: [],
      hp: 0,
      shield: 0,
      effects: [],
      growthStage: index + 1,
      sunPoints: (index % 3) + 1,
    }
  })

const writeFixture = (
  label: string,
  body: string,
  width: number,
  height: number,
  title: string,
): void => {
  const html = wrap(body, title, width, height)
  const path = resolve(fixturesDir, `${label}.html`)
  writeFileSync(path, html)
}

describe("FB-HUD4 visual export", () => {
  for (const viewport of VIEWPORTS) {
    for (const teamCount of [1, 2, 3, 4]) {
      it(`renders ${teamCount} teams at ${viewport.label}`, () => {
        const teams = buildTeams(teamCount)
        const scene = renderToString(
          <FlowerGardenScene seed={42} recipeVersion="1" teams={teams} />,
        )
        const hud = renderToString(
          <FlowerBattlePresenterHud
            variant="overlay"
            teams={teams}
            sunPoints={{}}
            answerCounter={{ answered: teamCount, total: teamCount * 2 }}
            countdown={{ seconds: 30 }}
          />,
        )
        const composite = scene + hud
        const label = `fb-hud4-${teamCount}teams-${viewport.label}`
        writeFixture(
          label,
          composite,
          viewport.width,
          viewport.height,
          `FB-HUD4 ${teamCount} Teams @ ${viewport.label}`,
        )
        expect(composite).toContain('data-testid="plant-team-card"')
        expect(composite).not.toContain('data-testid="flower-battle-team-meters"')
      })
    }
  }

  it("renders long team names without breaking the slot grid", () => {
    const teams: FlowerBattleTeamState[] = buildTeams(4).map((t) => ({
      ...t,
      name: `${t.name}-ExtraLong-Of-Magic-Apples-and-Disco-Ducks-Deluxe-Edition`,
    }))
    const scene = renderToString(
      <FlowerGardenScene seed={99} recipeVersion="1" teams={teams} />,
    )
    writeFixture(
      "fb-hud4-long-names-1600x927",
      scene,
      1600,
      927,
      "FB-HUD4 long team names @ 1600x927",
    )
    expect(scene).toContain('data-testid="plant-team-card"')
  })

  it("renders 0 % and 100 % progress states", () => {
    const zero = buildTeams(2).map((t) => ({ ...t, growthStage: 0, sunPoints: 0 }))
    const full = buildTeams(2).map((t) => ({ ...t, growthStage: 10, sunPoints: 3 }))
    const zeroScene = renderToString(
      <FlowerGardenScene seed={1} recipeVersion="1" teams={zero} />,
    )
    const fullScene = renderToString(
      <FlowerGardenScene seed={1} recipeVersion="1" teams={full} />,
    )
    writeFixture(
      "fb-hud4-zero-percent-1600x927",
      zeroScene,
      1600,
      927,
      "FB-HUD4 0% Progress",
    )
    writeFixture(
      "fb-hud4-full-percent-1600x927",
      fullScene,
      1600,
      927,
      "FB-HUD4 100% Progress",
    )
    expect(zeroScene).toContain("0 %")
    expect(fullScene).toContain("100 %")
  })
})