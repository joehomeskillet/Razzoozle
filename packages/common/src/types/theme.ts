export interface ThemeBackgrounds {
  // Start / join / manager-login / result screens (the <Background> wrapper)
  auth: string | null
  // The host's big presentation screen during a game
  managerGame: string | null
  // The player's in-game screen (phone)
  playerGame: string | null
}

export interface Theme {
  colorPrimary: string
  colorSecondary: string
  colorText: string
  answerColors: [string, string, string, string]
  answerTextColor: string
  accentColor: string
  radius: number
  scrim: number
  appTitle: string | null
  logo: string | null
  showBranding: boolean
  backgrounds: ThemeBackgrounds
}

export const DEFAULT_THEME: Theme = {
  colorPrimary: "#ff9900",
  colorSecondary: "#1a140b",
  colorText: "#ffffff",
  answerColors: ["#E69F00", "#56B4E9", "#3DBFA0", "#CC79A7"],
  answerTextColor: "#ffffff",
  accentColor: "#ff9900",
  radius: 16,
  scrim: 0,
  appTitle: null,
  logo: null,
  showBranding: true,
  backgrounds: {
    auth: null,
    managerGame: null,
    playerGame: null,
  },
}
