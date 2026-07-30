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
