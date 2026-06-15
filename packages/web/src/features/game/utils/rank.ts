// I18n key for a player's final rank. Mirrors the inline rankKeyMap logic in
// Result.tsx and PlayerFinished.tsx: 1/2/3 map to their own keys, everything
// else (including null/undefined) falls back to "game:rank.other".
const rankKeyMap: Record<number, string> = {
  1: "game:rank.1",
  2: "game:rank.2",
  3: "game:rank.3",
}

export function rankKeyFor(rank: number | null | undefined): string {
  return typeof rank === "number"
    ? (rankKeyMap[rank] ?? "game:rank.other")
    : "game:rank.other"
}
