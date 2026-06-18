import type { z } from "zod"

import type { themeValidator } from "@razzoozle/common/validators/theme"

export type AnimatedBackgroundType = "none" | "creamBackdrop"
export interface AnimatedBackgroundConfig {
  type: AnimatedBackgroundType
  speed: number
  intensity: number
  iconCount: number
}

export interface ThemeBackgrounds {
  // Start / join / manager-login / result screens (the <Background> wrapper)
  auth: string | null
  // The host's big presentation screen during a game
  managerGame: string | null
  // The player's in-game screen (phone)
  playerGame: string | null
  // Per-slot animated background config (defaults reproduce the current look)
  animated: {
    auth: AnimatedBackgroundConfig
    managerGame: AnimatedBackgroundConfig
    playerGame: AnimatedBackgroundConfig
  }
}

// Single source of truth is the zod validator: a parsed/persisted theme IS a
// `Theme`, so the type is inferred rather than hand-mirrored.
export type Theme = z.infer<typeof themeValidator>

export const DEFAULT_THEME: Theme = {
  style: "flat",
  colorPrimary: "#7c3aed",
  colorSecondary: "#2e1065",
  colorText: "#ffffff",
  answerColors: ["#E69F00", "#56B4E9", "#3DBFA0", "#CC79A7"],
  answerTextColor: "#ffffff",
  accentColor: "#ff9900",
  radius: 16,
  scrim: 40,
  appTitle: null,
  logo: null,
  showBranding: true,
  backgrounds: {
    auth: null,
    managerGame: null,
    playerGame: null,
    animated: {
      auth: { type: "creamBackdrop", speed: 1, intensity: 1, iconCount: 12 },
      managerGame: {
        type: "creamBackdrop",
        speed: 1,
        intensity: 1,
        iconCount: 12,
      },
      playerGame: {
        type: "creamBackdrop",
        speed: 1,
        intensity: 1,
        iconCount: 12,
      },
    },
  },
  teamColors: {
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    yellow: "#facc15",
  },
  tierColors: {
    bronze: "#b45309",
    silver: "#9ca3af",
    gold: "#eab308",
    diamant: "#38bdf8",
  },
  stateColors: {
    correct: "#22c55e",
    wrong: "#ef4444",
  },
  rankColors: {
    up: "#10b981",
    down: "#f43f5e",
  },
  timerUrgent: "#ff3b30",
  streakColor: "#b45309",
  surfaceMuted: "#374151",
  footerColors: {
    bg: "#ffffff",
    text: "#1f2937",
  },
  animation: {
    springStiffness: 300,
    springDamping: 24,
    durationScale: 1,
    staggerScale: 1,
  },
  sounds: {
    answersMusic: null,
    answersSound: null,
    podiumThree: null,
    podiumSecond: null,
    podiumFirst: null,
    podiumSnearRoll: null,
    results: null,
    show: null,
    boump: null,
    tierBronze: null,
    tierSilver: null,
    tierGold: null,
    tierDiamant: null,
  },
  customCssEnabled: false,
  customJsEnabled: false,
  skeletonVersion: 0,
}

// A named, savable preset of a full Theme (stored one-per-file under
// config/theme-templates/<id>.json). DATA on the wire carries the full template
// so a picker can apply it without a second fetch.
export interface ThemeTemplate {
  id: string
  name: string
  theme: Theme
}

// Lightweight listing of a template ({id,name}) — used by the design-tab picker
// and carried in ManagerConfig.themeTemplates.
export interface ThemeTemplateMeta {
  id: string
  name: string
}

// WP-18 — a captured prior theme. id is a timestamp-derived safe slug
// (e.g. `rev-${Date.now()}`); passes assertSafeId. createdAt is ISO.
export interface ThemeRevision {
  id: string
  createdAt: string
  theme: Theme
}
