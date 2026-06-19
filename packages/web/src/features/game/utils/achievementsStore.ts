const LS_KEY = "rahoot_achievements"

/** Read the {id: count} map from localStorage, increment the given ids, write back. */
export function persistAchievements(ids: string[]): void {
  if (ids.length === 0) return
  try {
    const raw = localStorage.getItem(LS_KEY)
    const stored: Record<string, number> = raw ? JSON.parse(raw) : {}
    for (const id of ids) {
      stored[id] = (stored[id] ?? 0) + 1
    }
    localStorage.setItem(LS_KEY, JSON.stringify(stored))
  } catch {
    // localStorage unavailable — silently skip
  }
}
