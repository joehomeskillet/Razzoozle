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
  answerColors: [string, string, string, string]
  backgrounds: ThemeBackgrounds
}

export const DEFAULT_THEME: Theme = {
  colorPrimary: "#ff9900",
  colorSecondary: "#1a140b",
  answerColors: ["#E69F00", "#56B4E9", "#3DBFA0", "#CC79A7"],
  backgrounds: {
    auth: null,
    managerGame: null,
    playerGame: null,
  },
}
