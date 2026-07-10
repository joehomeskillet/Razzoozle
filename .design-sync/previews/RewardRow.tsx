import { RewardRow, AchievementMedal } from "@razzoozle/web"
import { Flame, Star } from "lucide-react"

const wrap = {
  background: "var(--color-field-cream)",
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
  maxWidth: 420,
  listStyle: "none",
  margin: 0,
}

// RewardRow is a low-level atom: reduced/spring/durationMs/onDismiss are all
// required. durationMs={0} disables the auto-dismiss timer entirely and
// spring={{duration:0}} makes the entrance instant (no frozen-mid-animation
// risk). onDismiss is a required no-op — passing none crashes the row
// (see WAVE-ACHIEVE learnings / KNOWN CRASH note).
const INSTANT = { duration: 0 }

export const CompactVariants = () => (
  <ul style={wrap}>
    <RewardRow
      id="r-achievement"
      icon={<AchievementMedal id="first_responder" tier="gold" size="sm" animated={false} />}
      title="Erster Antworter"
      badge="Gold"
      accent="var(--tier-gold)"
      tone="compact"
      reduced={false}
      spring={INSTANT}
      durationMs={0}
      dismissLabel="Schliessen"
      onDismiss={() => {}}
    />
    <RewardRow
      id="r-streak"
      icon={<Flame className="size-6 text-orange-500" aria-hidden="true" />}
      title="Serie"
      value="+30%"
      accent="var(--color-primary)"
      tone="compact"
      reduced={false}
      spring={INSTANT}
      durationMs={0}
      dismissLabel="Schliessen"
      onDismiss={() => {}}
    />
    <RewardRow
      id="r-bonus"
      icon={<Star className="size-6 text-amber-400" aria-hidden="true" />}
      title="Doppelte Punkte"
      accent="var(--answer-4)"
      tone="compact"
      reduced={false}
      spring={INSTANT}
      durationMs={0}
      dismissLabel="Schliessen"
      onDismiss={() => {}}
    />
  </ul>
)

export const ToastTone = () => (
  <ul style={wrap}>
    <RewardRow
      id="r-toast"
      icon={<AchievementMedal id="perfect_game" tier="diamant" size="sm" animated={false} />}
      title="Perfektes Spiel"
      badge="Diamant"
      accent="var(--tier-diamant)"
      tone="toast"
      reduced={false}
      spring={INSTANT}
      durationMs={0}
      dismissLabel="Schliessen"
      onDismiss={() => {}}
    />
  </ul>
)
