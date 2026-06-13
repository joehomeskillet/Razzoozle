import type { Question } from "@razzia/common/types/game"

export type SubmissionStatus = "pending" | "approved" | "rejected"

export interface Submission {
  id: string
  submittedBy: string
  submittedAt: string
  status: SubmissionStatus
  question: Question
}

// Lightweight shape for ManagerConfig.submissions list
export interface SubmissionMeta {
  id: string
  submittedBy: string
  submittedAt: string
  status: SubmissionStatus
  question: string
}
