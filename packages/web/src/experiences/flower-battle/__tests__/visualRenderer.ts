//! Visual-Renderer (W9-PRESENTER-8) — Presenter-Mock für Node-Env.
//!
//! Generiert deterministisches HTML-Markup für ein Visual-Fixture, ohne
//! Browser-Rendering. Wird vom Visual-Regression-Test verwendet.
//!
//! STATUS: Skelett. Generiert strukturelles HTML (Plant-Marker, Team-Meter,
//! Sky-Band, Event-Banner) als deterministisches Markup. Wird in einer
//! Folge-Session durch echtes PixiJS-Rendering ersetzt.

import type { VisualFixture, TeamSnapshot } from "./visualFixtures"

export interface FixtureMeasurements {
  readonly plantHeightsPx: readonly number[]
  readonly visiblePlotCount: number
  readonly cloudCount: number
}

/**
 * Rendert ein Visual-Fixture als deterministisches HTML-Markup.
 * Verwendet eine simple Mock-Implementierung (Strings + divs), die die
 * strukturellen Signale liefert, die der Visual-Regression-Test braucht.
 */
export function renderFixtureHtml(fixture: VisualFixture): string {
  const plants = fixture.teams
    .map(
      (team) => `
    <div class="flower-plant flower-plant-${team.teamId}" data-stage="${team.growthStage}" data-team="${team.teamId}" data-face="${team.face}" style="height: ${stageHeight(team.growthStage)}px">
      <div class="flower-plant-stem"></div>
      <div class="flower-plant-head"></div>
      <div class="flower-plant-face">${faceEmoji(team.face)}</div>
    </div>
    <div class="team-meter team-meter-${team.teamId}">${team.growthStage}/${team.maxGrowthStage}</div>
  `,
    )
    .join("\n")

  const eventBanner = fixture.eventBanner
    ? `<div class="event-banner">${fixture.eventBanner.teamName} setzt ${fixture.eventBanner.powerupName} ein</div>`
    : ""

  const reducedMotionAttr = fixture.reducedMotion ? `data-reduced-motion="true"` : ""

  return `<!doctype html>
<html>
<head>
  <title>${fixture.id} — ${fixture.description}</title>
  <style>body { margin: 0; }</style>
</head>
<body ${reducedMotionAttr}>
  <div class="sky sky-day"></div>
  <div class="clouds">
    <div class="cloud cloud-1"></div>
    <div class="cloud cloud-2"></div>
    <div class="cloud cloud-3"></div>
  </div>
  <div class="garden">
    ${plants}
  </div>
  ${eventBanner}
</body>
</html>`
}

/**
 * Misst die strukturellen Größen eines Fixtures.
 */
export function measureFixtureSvg(fixture: VisualFixture): FixtureMeasurements {
  const plantHeightsPx = fixture.teams.map((t) => stageHeight(t.growthStage))
  return {
    plantHeightsPx,
    visiblePlotCount: fixture.teams.length,
    cloudCount: 3,
  }
}

function stageHeight(stage: TeamSnapshot["growthStage"]): number {
  // Stage 1 = Keimling (klein), Stage 4 = voll erblüht (groß)
  return stage * 100
}

function faceEmoji(face: TeamSnapshot["face"]): string {
  const map: Record<TeamSnapshot["face"], string> = {
    happy: ":)",
    hurt: ":/",
    protected: "[]",
    boosted: ":D",
    winner: "*_*",
  }
  return map[face]
}
