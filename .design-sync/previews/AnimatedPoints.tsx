import { AnimatedPoints } from "@razzoozle/web"

// Mirrors Leaderboard.tsx's actual row markup (accent-filled row, bold big
// number) so the atom is graded in its real host context.
export const LeaderboardRow = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <div
      className="flex w-full max-w-xs items-center justify-between rounded-xl bg-[var(--color-accent)] p-3 text-3xl font-bold text-[var(--accent-contrast-text)]"
    >
      <span>Mara</span>
      <AnimatedPoints from={640} to={890} />
    </div>
  </div>
)

// Mirrors ScoreToast.tsx's "+<points>" markup (amber count-up on a card).
export const ScoreGain = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <span className="text-3xl font-black tabular-nums text-amber-500">
      +<AnimatedPoints to={380} className="tabular-nums" />
    </span>
  </div>
)
