import type { z } from "zod"

import type { themeValidator } from "@razzoozle/common/validators/theme"

export interface ThemeBackgrounds {
  // Start / join / manager-login / result screens (the <Background> wrapper)
  auth: string | null
  // The host's big presentation screen during a game
  managerGame: string | null
  // The player's in-game screen (phone)
  playerGame: string | null
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
  },
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
