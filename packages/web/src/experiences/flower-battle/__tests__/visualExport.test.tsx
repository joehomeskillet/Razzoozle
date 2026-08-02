import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { FlowerBattlePresenterHud } from "../FlowerBattlePresenterHud"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const teams: FlowerBattleTeamState[] = [
  { name: "Team Alpha", members: ["a","b"], hp: 0, shield: 0, effects: ["sunbeam"], growthStage: 2, sunPoints: 2 },
  { name: "Team Bravo", members: ["c","d"], hp: 0, shield: 0, effects: ["acid_rain"], growthStage: 1, sunPoints: 1 },
  { name: "Team Charlie", members: ["e","f"], hp: 0, shield: 0, effects: ["umbrella_shield"], growthStage: 1, sunPoints: 1 },
  { name: "Team Delta", members: ["g","h"], hp: 0, shield: 0, effects: [], growthStage: 0, sunPoints: 0 },
]

const html = renderToString(
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

const wrapped = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>FB-HUD3 Integration</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; }
  body {
    background: linear-gradient(135deg, #0E1120 0%, #2A2454 100%);
    color: #fff;
    font-family: system-ui, -apple-system, sans-serif;
  }
  #root { width: 100%; height: 100%; padding: 1rem; position: relative; }
  .flower-battle-presenter-hud { position: relative; height: 100%; width: 100%; }
</style>
</head>
<body>
<div id="root">${html}</div>
</body>
</html>`

const PAGE_DIR = resolve("/nvmetank1/projects/Razzoozle/source/.claude/worktrees/fb-hud3-integration/scratchpad/fb-hud-orchestrator/screenshots")
mkdirSync(PAGE_DIR, { recursive: true })
writeFileSync(resolve(PAGE_DIR, "fb-hud3-prese42nter-hud.html"), wrapped)

describe("export", () => {
  it("renders HUD markup", () => {
    expect(html).toContain('data-testid="flower-battle-presenter-hud"')
    expect(html).toContain('data-testid="flower-battle-team-meters"')
    expect(html).toContain('data-testid="flower-battle-timer-slot"')
    expect(html).toContain('data-testid="flower-battle-answer-counter-slot"')
  })
})
