import type { Team } from "@razzoozle/common/constants"

import type { PowerupType } from "@razzoozle/web/features/game/components/player/flower-battle.types"

/** Mirrors rust/protocol FlowerBattleEffect (snake_case wire values). */
export type FlowerBattleActiveEffect = "umbrella_shield" | "acid_rain" | "sunbeam"

/**
 * Per-team public battle state for presenter/scene components (no Q&A content).
 * Hand-mirrored from rust/protocol/bindings/FlowerBattleTeamState.ts.
 */
export interface FlowerBattleTeamState {
  name: string
  members: string[]
  hp: number
  shield: number
  effects: FlowerBattleActiveEffect[]
  /**
   * Cumulative plant growth stage (0..=10); win at 10 (WP #933). Wire field
   * since #933/L-08 — feeds FlowerPlant directly (WP #939C), never derived
   * from sunPoints.
   */
  growthStage: number
  sunPoints: number
  previousAttackerTeamId?: string
}

/** Optional active power-up highlight for the presenter HUD. */
export interface PowerUpData {
  type: PowerupType
  teamName?: string
}

export type FlowerBattleSunPointsByTeam = Partial<Record<Team, number>>
