// Sort options offered above the quiz list. "created date" is intentionally
// omitted: QuizzMeta carries no timestamp, so there is no field to sort on.
export type SortKey = "name-asc" | "count-desc" | "count-asc"
