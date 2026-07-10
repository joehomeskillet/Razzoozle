import { TrophyGallery } from "@razzoozle/web"

// TrophyGallery reads its unlocked-count map from localStorage("rahoot_achievements")
// on mount and separately fetches /api/achievements (no such route on the
// static preview server — the fetch rejects and the component's own .catch
// falls back to the static ACHIEVEMENT_META + i18n, exactly like production
// with the manager-override endpoint unreachable). Seeding localStorage here,
// synchronously in the cell's render body, runs before TrophyGallery's own
// mount effect reads it.
function seed(counts: Record<string, number> | null) {
  if (typeof window === "undefined") return
  if (counts === null) window.localStorage.removeItem("rahoot_achievements")
  else window.localStorage.setItem("rahoot_achievements", JSON.stringify(counts))
}

const wrap = { background: "var(--color-field-cream)", minHeight: 480 }

export const Populated = () => {
  seed({
    first_correct: 3,
    participation: 1,
    lucky_guess: 2,
    speed_demon: 1,
    streak_3: 4,
    first_responder: 1,
    perfect_round: 2,
    streak_10: 1,
  })
  return (
    <div style={wrap}>
      <TrophyGallery />
    </div>
  )
}

export const Empty = () => {
  seed(null)
  return (
    <div style={wrap}>
      <TrophyGallery />
    </div>
  )
}
