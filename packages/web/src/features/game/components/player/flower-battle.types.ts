import { CloudRain, Sprout, Sun, Umbrella } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

// FlowerBattle player-facing UI types (WP #941). Extended by WP #942
// (power-up target voting) — keep this file a plain barrel of UI-facing
// shapes, not a home for socket/server logic.

// The 4 power-ups the domain contract (WP #927) can offer. APPEND-ONLY: a
// persisted/broadcast offerType naming one of these must keep working.
export const POWERUP_TYPES = [
  "fertilizer",
  "sunbeam",
  "umbrella_shield",
  "acid_rain",
] as const

export type PowerupType = (typeof POWERUP_TYPES)[number]

export const isPowerupType = (value: string): value is PowerupType =>
  (POWERUP_TYPES as readonly string[]).includes(value)

// GENAU 3 Karten: offerType is a comma-joined string on the wire, never an
// array. Unknown/garbled ids are dropped defensively rather than rendered
// blank; a malformed offer (fewer/more than 3 known ids) is caught by the
// caller's `options.length === 3` gate, not here.
export const parsePowerupOptions = (offerType: string): PowerupType[] =>
  offerType
    .split(",")
    .map((id) => id.trim())
    .filter(isPowerupType)
    .slice(0, 3)

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

// Icon only — name/effect copy lives in locale `game.json` under
// `flowerBattle.powerupVote.options.<id>.{name,effect}` (i18n-owned, never
// hardcoded here). Falls back to the lucide icon for all 4 options until the
// bespoke SVG set from #938.1 lands (grep-verified absent as of WP #941).
export const POWERUP_ICONS: Record<PowerupType, IconComponent> = {
  fertilizer: Sprout,
  sunbeam: Sun,
  umbrella_shield: Umbrella,
  acid_rain: CloudRain,
}

// Mirrors the wire-relevant subset of rust/protocol/bindings/PowerupOffer.ts
// (ts-rs types `expiresAt` as `bigint` for the Rust u64; the actual socket.io
// JSON wire carries a plain number — same convention as
// `answerDeadlineAtServerMs`/`serverNowMs` in packages/common/types/game/status.ts).
// `offerType` is a COMMA-JOINED STRING of exactly 3 PowerupType ids, never an
// array on the wire.
export interface PowerupOfferView {
  id: string
  offerType: string
  expiresAt: number
}

export interface FlowerPowerupVoteProps {
  /** Current experience mode; the vote UI only ever renders for "flowerBattle". */
  mode: string
  /** The open offer awaiting a vote, or null/undefined when none is active. */
  offer: PowerupOfferView | null | undefined
}

// ---- WP #942: target-team vote (opens only for the acid_rain power-up) ----

// Fixed vote window once an acid_rain selection broadcasts. There is no
// server-provided deadline for this step yet (POWERUP_SELECTED has no typed
// binding — see TargetVoteSelection below), so — unlike PowerupOfferView's
// server-carried `expiresAt` — the deadline is DERIVED client-side as
// `selectedAtServerMs + TARGET_VOTE_WINDOW_MS`.
export const TARGET_VOTE_WINDOW_MS = 5_000

// Mirrors the wire-relevant subset of rust/protocol/bindings/FlowerBattleTeamState.ts
// (name/effects/previousAttackerTeamId only — hp/shield/sunPoints/members are
// not needed for target selection).
export interface FlowerTeamView {
  name: string
  effects: string[]
  previousAttackerTeamId?: string | null
}

// Caller-supplied projection of the FLOWER_BATTLE.POWERUP_SELECTED broadcast.
// Same "Props-getrieben" pattern as WP #941's PowerupOfferView: the server
// handler/emitter for this event isn't live yet either, so the caller builds
// this from whatever it has rather than this component owning a socket
// subscription.
export interface TargetVoteSelection {
  /** Mirrors the resolved PowerupOffer.id this selection came from. */
  offerId: string
  /** The power-up that was picked; this UI only opens for "acid_rain". */
  optionId: PowerupType
  /** Server epoch ms when the selection broadcast — anchors the 5s window. */
  selectedAtServerMs: number
}

export interface TargetTeamVoteProps {
  /** Current experience mode; the vote UI only ever renders for "flowerBattle". */
  mode: string
  /** The acid_rain selection awaiting a target vote, or null/undefined when none is active. */
  selection: TargetVoteSelection | null | undefined
  /** All teams' current public battle state. */
  teams: FlowerTeamView[]
  /** The voting player's own team name — excluded from the candidate chips. */
  ownTeamName: string
}

// Pure so it's directly unit-testable with hard-literal team arrays (mirrors
// parsePowerupOptions above) — the voter's own team is never a valid attack
// target.
export const filterVoteCandidates = (
  teams: FlowerTeamView[],
  ownTeamName: string,
): FlowerTeamView[] => teams.filter((team) => team.name !== ownTeamName)
