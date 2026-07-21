// MediaUsageEntry.ts — Tracks where a media item is used in quizzes
// Part of MediaMeta.usage field (populated server-side)

export type MediaUsageEntry = {
  quizId: string
  quizTitle: string
  questionIndex: number
  questionLabel: string
}
