import type { z } from "zod"

import type { themeValidator } from "@razzia/common/validators/theme"

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
  colorPrimary: "#ff9900",
  colorSecondary: "#1a140b",
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
