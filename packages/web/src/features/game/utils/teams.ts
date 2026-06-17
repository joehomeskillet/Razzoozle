import { TEAMS } from "@razzoozle/common/constants"
import type { Team } from "@razzoozle/common/constants"

// Single source for the 4 fixed team colour class strings, killing the
// Wait / Room / TeamLeaderboard duplication. Every colour is backed by the
// frozen team tokens (`--team-{color}`, `--team-{color}-ring`,
// `--team-{color}-text`, see docs/design/skeleton-system.md §6) so a skeleton
// theme can recolour teams everywhere at once. Token defaults equal the old
// hardcoded values, so this is a visual no-op with the default theme.
//
// Class strings are written as full literals per team (not built via runtime
// interpolation) so Tailwind v4's source scanner can extract them.

const isTeam = (t: string): t is Team => (TEAMS as readonly string[]).includes(t)

// Picker swatch (Wait.tsx): solid fill + ring + dark label text.
const SWATCH: Record<Team, { bg: string; ring: string; label: string }> = {
  red: {
    bg: "bg-[var(--team-red)]",
    ring: "ring-[var(--team-red-ring)]",
    label: "text-[var(--team-red-text)]",
  },
  blue: {
    bg: "bg-[var(--team-blue)]",
    ring: "ring-[var(--team-blue-ring)]",
    label: "text-[var(--team-blue-text)]",
  },
  green: {
    bg: "bg-[var(--team-green)]",
    ring: "ring-[var(--team-green-ring)]",
    label: "text-[var(--team-green-text)]",
  },
  yellow: {
    bg: "bg-[var(--team-yellow)]",
    ring: "ring-[var(--team-yellow-ring)]",
    label: "text-[var(--team-yellow-text)]",
  },
}

// Solid dot fill (Room.tsx manager roster).
const DOT: Record<Team, string> = {
  red: "bg-[var(--team-red)]",
  blue: "bg-[var(--team-blue)]",
  green: "bg-[var(--team-green)]",
  yellow: "bg-[var(--team-yellow)]",
}

// Leaderboard tint (TeamLeaderboard.tsx): pale panel bg + dark text + solid
// bar. The pale bg is derived from the base token via color-mix (was the old
// `*-100` tints) so it stays themeable without a separate token.
const COLOR: Record<Team, { bg: string; text: string; bar: string }> = {
  red: {
    bg: "bg-[color-mix(in_srgb,var(--team-red),white_85%)]",
    text: "text-[var(--team-red-text)]",
    bar: "bg-[var(--team-red)]",
  },
  blue: {
    bg: "bg-[color-mix(in_srgb,var(--team-blue),white_85%)]",
    text: "text-[var(--team-blue-text)]",
    bar: "bg-[var(--team-blue)]",
  },
  green: {
    bg: "bg-[color-mix(in_srgb,var(--team-green),white_85%)]",
    text: "text-[var(--team-green-text)]",
    bar: "bg-[var(--team-green)]",
  },
  yellow: {
    bg: "bg-[color-mix(in_srgb,var(--team-yellow),white_85%)]",
    text: "text-[var(--team-yellow-text)]",
    bar: "bg-[var(--team-yellow)]",
  },
}

// Neutral fallback for an unknown / missing team id (mirrors the old gray map).
const COLOR_FALLBACK = {
  bg: "bg-gray-100",
  text: "text-gray-800",
  bar: "bg-gray-400",
}

export const teamSwatch = (team: Team) => SWATCH[team]

export const teamDot = (team: string): string | undefined =>
  isTeam(team) ? DOT[team] : undefined

export const teamColor = (team: string) =>
  isTeam(team) ? COLOR[team] : COLOR_FALLBACK

export { TEAMS }
export type { Team }
