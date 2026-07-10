interface ThemeTokenDef {
  cssVar: string // CSS custom property name, e.g. "--state-correct"
  path: string // dot-path into Theme, e.g. "stateColors.correct"
  label: string // human label for the editor / doc
  group: string // editor grouping + doc section
  description: string
}

// Only the COLOR tokens that are set 1:1 from a hex value go here. The bespoke
// originals (radius px, scrim /100, style attr, answer array, title) keep their
// hand-written handling in applyTheme.
export const THEME_TOKENS: ThemeTokenDef[] = [
  {
    cssVar: "--team-red",
    path: "teamColors.red",
    label: "Team Red",
    group: "Teams",
    description: "Red team base color (ring/text derived darker).",
  },
  {
    cssVar: "--team-blue",
    path: "teamColors.blue",
    label: "Team Blue",
    group: "Teams",
    description: "Blue team base color.",
  },
  {
    cssVar: "--team-green",
    path: "teamColors.green",
    label: "Team Green",
    group: "Teams",
    description: "Green team base color.",
  },
  {
    cssVar: "--team-yellow",
    path: "teamColors.yellow",
    label: "Team Yellow",
    group: "Teams",
    description: "Yellow team base color.",
  },
  {
    cssVar: "--tier-bronze",
    path: "tierColors.bronze",
    label: "Bronze",
    group: "Tiers",
    description:
      "Bronze tier: 3rd podium, bronze achievements, leaderboard banner.",
  },
  {
    cssVar: "--tier-silver",
    path: "tierColors.silver",
    label: "Silver",
    group: "Tiers",
    description: "Silver tier: 2nd podium, silver achievements.",
  },
  {
    cssVar: "--tier-gold",
    path: "tierColors.gold",
    label: "Gold",
    group: "Tiers",
    description: "Gold tier: 1st podium, gold achievements.",
  },
  {
    cssVar: "--tier-diamant",
    path: "tierColors.diamant",
    label: "Diamant",
    group: "Tiers",
    description: "Diamond tier: top achievements.",
  },
  {
    cssVar: "--state-correct",
    path: "stateColors.correct",
    label: "Correct",
    group: "State",
    description: "Correct-answer highlight.",
  },
  {
    cssVar: "--state-wrong",
    path: "stateColors.wrong",
    label: "Wrong",
    group: "State",
    description: "Wrong-answer highlight.",
  },
  {
    cssVar: "--rank-up",
    path: "rankColors.up",
    label: "Rank up",
    group: "Rank",
    description: "Leaderboard climber chip.",
  },
  {
    cssVar: "--rank-down",
    path: "rankColors.down",
    label: "Rank down",
    group: "Rank",
    description: "Leaderboard faller chip.",
  },
  {
    cssVar: "--timer-urgent",
    path: "timerUrgent",
    label: "Timer urgent",
    group: "Misc",
    description: "Countdown ring color in the final urgent phase.",
  },
  {
    cssVar: "--streak-color",
    path: "streakColor",
    label: "Streak badge",
    group: "Misc",
    description: "Answer-streak flame badge.",
  },
  {
    cssVar: "--surface-muted",
    path: "surfaceMuted",
    label: "Muted surface",
    group: "Misc",
    description: "Neutral panel background (e.g. question-teaser grid).",
  },
  {
    cssVar: "--footer-bg",
    path: "footerColors.bg",
    label: "Footer bg",
    group: "Misc",
    description: "Player score footer background.",
  },
  {
    cssVar: "--footer-text",
    path: "footerColors.text",
    label: "Footer text",
    group: "Misc",
    description: "Player score footer text.",
  },
]
