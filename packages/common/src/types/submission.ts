import type { SubmissionCategory } from "@razzoozle/common/constants"
import type { Question } from "@razzoozle/common/types/game"

export type SubmissionStatus = "pending" | "approved" | "rejected"

export interface Submission {
  id: string
  submittedBy: string
  submittedAt: string
  status: SubmissionStatus
  question: Question
  category?: SubmissionCategory // WP-17 — public topic category (optional)
  rejectionReason?: string // WP-17 — moderator note (optional, set at reject time)
}

// Lightweight shape for ManagerConfig.submissions list
export interface SubmissionMeta {
  id: string
  submittedBy: string
  submittedAt: string
  status: SubmissionStatus
  question: string
}
