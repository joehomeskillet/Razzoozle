//! Visual-Regression-Fixtures (W9-PRESENTER-8) für den Blüten-Battle-Presenter.
//!
//! 11 Pflicht-Zustände laut User-P0 §11.1:
//! 1. 2 Teams, Stage 1 (Keimling)
//! 2. 2 Teams, Stage 4 (voll erblüht)
//! 3. 3 Teams, gemischte Stages
//! 4. 4 Teams, alle 4 Stages sichtbar
//! 5. Dünger auf einem Team
//! 6. Saurer Regen auf einem Team
//! 7. Schutz blockiert sauren Regen
//! 8. Sonnenstrahl und Wachstum
//! 9. Schaden/Hurt-State
//! 10. Game-Completed/Winner
//! 11. Reconnect/Hard-Reload mit neuester Revision
//!
//! + Reduced Motion als Bonus-12.
//!
//! 5 Pflicht-Viewports (User-P0 §11.2):
//! - 1920×1080 (DPR 1 + 2)
//! - 1366×768
//! - 1280×720
//! - 1024×768 (Robustheit)
//! - 375×667 (Smartphone-Probe)
//!
//! 11 × 5 = 55 Test-Cases, jeweils mit False-PASS-Schutz.

import type { TeamId } from "@razzoozle/web/experiences/flower-battle/rendering/teamFlowerFactory"

/** Viewport-Definition: {id, width, height, label, dpr}. */
export interface VisualViewport {
  id: string
  width: number
  height: number
  label: string
  dpr: Dpr
}

/** Backward-compat: Literal-Union wird intern in Objects konvertiert. */
export type ViewportIdLiteral = "1920x1080" | "1366x768" | "1280x720" | "1024x768" | "375x667"

/** Alias-Kompatibilität für visualRegression.test.tsx. */
export type ViewportId = ViewportIdLiteral

export type Dpr = 1 | 2

export type VisualScenarioId =
  | "2teams-stage-1"
  | "2teams-stage-4"
  | "3teams-mixed"
  | "4teams-all-stages"
  | "fertilizer-on-team"
  | "acid-rain-on-team"
  | "shield-blocks-acid-rain"
  | "sunbeam-and-growth"
  | "damage-hurt"
  | "game-completed-winner"
  | "reconnect-latest-revision"
  | "reduced-motion"

/** Alias-Kompatibilität für visualRegression.test.tsx. */
export type FixtureId = VisualScenarioId

/** Single Team-Snapshot in einem Fixture. */
export interface TeamSnapshot {
  teamId: TeamId
  growthStage: 1 | 2 | 3 | 4
  sunPoints: number
  maxGrowthStage: number
  maxSunPoints: number
  activeEffects: readonly string[]
  /** Face-Layer-Variante für diesen Snapshot. */
  face: "happy" | "hurt" | "protected" | "boosted" | "winner"
}

/** Vollständiger Presenter-Snapshot pro Fixture. */
export interface VisualFixture {
  id: VisualScenarioId
  description: string
  /** Alias für description — kompatibel mit visualRegression.test.tsx */
  title: string
  teams: readonly TeamSnapshot[]
  activeCues: readonly (
    | "fertilizer"
    | "acid_rain"
    | "sunbeam"
    | "shield"
    | "growth"
    | "damage"
    | "winner"
  )[]
  /** Optional Event-Banner (für Power-up-Tests). */
  eventBanner?: {
    teamName: string
    powerupName: string
    weatherIcon: "cloud" | "sun" | "fertilizer" | "umbrella"
  }
  /** Reduced-Motion-Modus (für das Bonus-Fixture). */
  reducedMotion?: boolean
}

const VIOLET: TeamSnapshot = {
  teamId: "violet",
  growthStage: 1,
  sunPoints: 0,
  maxGrowthStage: 4,
  maxSunPoints: 3,
  activeEffects: [],
  face: "happy",
}

const BLUE: TeamSnapshot = {
  teamId: "blue",
  growthStage: 4,
  sunPoints: 3,
  maxGrowthStage: 4,
  maxSunPoints: 3,
  activeEffects: [],
  face: "happy",
}

const ORANGE: TeamSnapshot = {
  teamId: "orange",
  growthStage: 2,
  sunPoints: 1,
  maxGrowthStage: 4,
  maxSunPoints: 3,
  activeEffects: [],
  face: "happy",
}

const GREEN: TeamSnapshot = {
  teamId: "green",
  growthStage: 3,
  sunPoints: 2,
  maxGrowthStage: 4,
  maxSunPoints: 3,
  activeEffects: [],
  face: "happy",
}

/** 11 Pflicht-Fixtures (W9-PRESENTER-8 §11.1). */
export const VISUAL_FIXTURES: readonly VisualFixture[] = [
  {
    id: "2teams-stage-1",
    description: "2 Teams, beide auf Stage 1 (Keimling)",
    title: "2 Teams Stage 1",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 1 },
      { ...BLUE, teamId: "blue", growthStage: 1 },
    ],
    activeCues: [],
  },
  {
    id: "2teams-stage-4",
    description: "2 Teams, beide auf Stage 4 (voll erblüht)",
    title: "2 Teams, beide auf Stage 4",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 4, sunPoints: 3 },
      { ...BLUE, teamId: "blue", growthStage: 4, sunPoints: 3 },
    ],
    activeCues: [],
  },
  {
    id: "3teams-mixed",
    description: "3 Teams, gemischte Stages (1, 3, 4)",
    title: "3 Teams, gemischte Stages",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 1 },
      { ...BLUE, teamId: "blue", growthStage: 3, sunPoints: 1 },
      { ...ORANGE, teamId: "orange", growthStage: 4, sunPoints: 3 },
    ],
    activeCues: [],
  },
  {
    id: "4teams-all-stages",
    description: "4 Teams, alle 4 Stages sichtbar",
    title: "4 Teams, alle 4 Stages sichtbar",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 1 },
      { ...BLUE, teamId: "blue", growthStage: 2, sunPoints: 1 },
      { ...ORANGE, teamId: "orange", growthStage: 3, sunPoints: 2 },
      { ...GREEN, teamId: "green", growthStage: 4, sunPoints: 3 },
    ],
    activeCues: [],
  },
  {
    id: "fertilizer-on-team",
    description: "Dünger-Powerup auf violettem Team",
    title: "Dünger-Powerup auf violettem Team",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 2, face: "boosted" },
      { ...BLUE, teamId: "blue", growthStage: 3, sunPoints: 2 },
    ],
    activeCues: ["fertilizer"],
    eventBanner: {
      teamName: "Team Violett",
      powerupName: "Dünger",
      weatherIcon: "fertilizer",
    },
  },
  {
    id: "acid-rain-on-team",
    description: "Saurer Regen auf blauem Team",
    title: "Saurer Regen auf blauem Team",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 3, sunPoints: 1 },
      { ...BLUE, teamId: "blue", growthStage: 4, face: "hurt" },
    ],
    activeCues: ["acid_rain", "damage"],
    eventBanner: {
      teamName: "Team Blau",
      powerupName: "Saurer Regen",
      weatherIcon: "cloud",
    },
  },
  {
    id: "shield-blocks-acid-rain",
    description: "Schutzschild blockiert sauren Regen für violett",
    title: "Schutzschild blockiert sauren Regen für violett",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 4, face: "protected" },
      { ...BLUE, teamId: "blue", growthStage: 3, sunPoints: 1 },
    ],
    activeCues: ["shield"],
    eventBanner: {
      teamName: "Team Violett",
      powerupName: "Regenschutz",
      weatherIcon: "umbrella",
    },
  },
  {
    id: "sunbeam-and-growth",
    description: "Sonnenstrahl + Growth auf orange Team",
    title: "Sonnenstrahl + Growth auf orange Team",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 4, sunPoints: 3 },
      { ...BLUE, teamId: "blue", growthStage: 4, sunPoints: 3 },
      { ...ORANGE, teamId: "orange", growthStage: 4, face: "boosted" },
    ],
    activeCues: ["sunbeam", "growth"],
    eventBanner: {
      teamName: "Team Orange",
      powerupName: "Sonnenstrahl",
      weatherIcon: "sun",
    },
  },
  {
    id: "damage-hurt",
    description: "Schaden-Status (hurt-face) auf grün",
    title: "Schaden-Status",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 3, sunPoints: 1 },
      { ...BLUE, teamId: "blue", growthStage: 3, sunPoints: 1 },
      { ...ORANGE, teamId: "orange", growthStage: 3, sunPoints: 1 },
      { ...GREEN, teamId: "green", growthStage: 3, face: "hurt" },
    ],
    activeCues: ["damage"],
  },
  {
    id: "game-completed-winner",
    description: "Game-Completed: violett gewinnt",
    title: "Game-Completed: violett gewinnt",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 4, sunPoints: 3, face: "winner" },
      { ...BLUE, teamId: "blue", growthStage: 3, sunPoints: 2 },
      { ...ORANGE, teamId: "orange", growthStage: 2, sunPoints: 1 },
      { ...GREEN, teamId: "green", growthStage: 1 },
    ],
    activeCues: ["winner"],
  },
  {
    id: "reconnect-latest-revision",
    description: "Reconnect: neueste Flower-Revision, alle 4 Stages stabil",
    title: "Reconnect: neueste Flower-Revision, alle 4 Stages stabil",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 4, sunPoints: 3 },
      { ...BLUE, teamId: "blue", growthStage: 4, sunPoints: 3 },
      { ...ORANGE, teamId: "orange", growthStage: 4, sunPoints: 3 },
      { ...GREEN, teamId: "green", growthStage: 4, sunPoints: 3 },
    ],
    activeCues: [],
  },
  {
    id: "reduced-motion",
    description: "Reduced Motion Modus: 4 Teams, alle Stages",
    title: "Reduced Motion Modus: 4 Teams, alle Stages",
    teams: [
      { ...VIOLET, teamId: "violet", growthStage: 4, sunPoints: 3 },
      { ...BLUE, teamId: "blue", growthStage: 4, sunPoints: 3 },
      { ...ORANGE, teamId: "orange", growthStage: 4, sunPoints: 3 },
      { ...GREEN, teamId: "green", growthStage: 4, sunPoints: 3 },
    ],
    activeCues: ["growth"],
    reducedMotion: true,
  },
]

/** 5 Pflicht-Viewports (W9-PRESENTER-8 §11.2) — kompakte Literal-Union. */
export const VISUAL_VIEWPORTS: readonly ViewportIdLiteral[] = [
  "1920x1080",
  "1366x768",
  "1280x720",
  "1024x768",
  "375x667",
]

export const VISUAL_DPRS: readonly Dpr[] = [1, 2]

/** Vollständige Matrix: 12 Fixtures × 5 Viewports = 60 Cases (11 Pflicht × 5 + 1 Bonus × 5). */
export const VISUAL_CASES: ReadonlyArray<{
  fixture: VisualFixture
  viewport: ViewportIdLiteral
  dpr: Dpr
}> = VISUAL_FIXTURES.flatMap((fixture) =>
  VISUAL_VIEWPORTS.flatMap((viewport) =>
    VISUAL_DPRS.map((dpr) => ({ fixture, viewport, dpr })),
  ),
)

/** Selektor-Helfer: alle Cases für ein Fixture. */
export function casesForFixture(id: string): ReadonlyArray<{
  fixture: VisualFixture
  viewport: ViewportIdLiteral
  dpr: Dpr
}> {
  return VISUAL_CASES.filter((c) => c.fixture.id === id)
}

/** Selektor-Helfer: alle Cases für ein Viewport. */
export function casesForViewport(
  viewport: string,
): ReadonlyArray<{
  fixture: VisualFixture
  viewport: ViewportIdLiteral
  dpr: Dpr
}> {
  return VISUAL_CASES.filter((c) => c.viewport === viewport)
}
