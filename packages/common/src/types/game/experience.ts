// Content-free `game:experience` transition envelope (WP #877, protocol
// contract WP #876). Mirrors the wire-relevant subset of
// rust/protocol/src/experience.rs::ExperienceTransition — only the fields the
// display components render today. Mode-specific payload fields (team_steps,
// chase) land here once WP #904/#905 need them client-side.
//
// WP #939C — added the envelope's `payload` field (previously missing
// entirely, so no display component could read team/background state) plus
// the FlowerBattle-specific payload shape. Hand-mirrored like every other
// FlowerBattle wire type in this repo (see packages/common/src/types/game/
// socket.ts, packages/web/.../flower-battle-scene.types.ts) rather than
// importing across files. New fields are optional so existing minimal
// envelope literals (e.g. ExperienceDisplay's tests) stay valid.
export interface ExperienceTransition {
  mode: string
  phase: string
  phaseStartedAtServerMs?: number
  phaseDurationMs?: number
  revision?: number
  answered?: number
  total?: number
  payload?: ExperiencePayload
}

/** Wire values of `FlowerBattlePhase` (rust/protocol/src/experience.rs). */
export type FlowerBattlePhase =
  | "start"
  | "greeting"
  | "role_assignment"
  | "preparation"
  | "round1"
  | "round2"
  | "round3"
  | "voting"
  | "results"
  | "end"

/** Wire values of `FlowerBattleEffect` (rust/protocol/src/experience.rs). */
export type FlowerBattleActiveEffect = "umbrella_shield" | "acid_rain" | "sunbeam"

/** Per-team public battle state (no solution / Q&A content). */
export interface FlowerBattleTeamState {
  name: string
  members: string[]
  hp: number
  shield: number
  effects: FlowerBattleActiveEffect[]
  /** Cumulative plant growth stage (0..=10); win at 10 (WP #933). */
  growthStage: number
  sunPoints: number
  previousAttackerTeamId?: string
}

/** Deterministic garden-background seed + fixed recipe version. */
export interface FlowerBattleBackground {
  seed: string
  recipeVersion: number
}

export interface FlowerBattlePowerupOffer {
  id: string
  offerType: string
  expiresAt: number
}

export interface FlowerBattleState {
  phase: FlowerBattlePhase
  teams: FlowerBattleTeamState[]
  background: FlowerBattleBackground
  powerups: FlowerBattlePowerupOffer[]
}

/**
 * Mode-tagged payload body inside `ExperienceTransition.payload`. Only the
 * FlowerBattle shape (`data.state`) is modeled here — Pyramid/DeepSea payload
 * internals aren't consumed by any display component yet.
 */
export interface ExperiencePayload {
  mode: string
  data?: {
    state?: FlowerBattleState
  }
}
