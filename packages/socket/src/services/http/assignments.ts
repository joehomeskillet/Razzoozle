import type { IncomingMessage, ServerResponse } from "http"
import type { Assignment } from "@razzoozle/common/validators/assignment"
import { assignmentValidator } from "@razzoozle/common/validators/assignment"
import {
  assertSafeId,
  getQuizzById,
  getAssignment,
  saveAssignment,
  getSoloResults,
} from "@razzoozle/socket/services/config"
import { nanoid } from "nanoid"
import { jsonOk, jsonError } from "./respond"
import { readBody, statusFrom413 } from "./body"
import { authorizeManagerRequest } from "./broadcasters/manager-auth"

export const handleCreateAssignment = (
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      const body = await readBody(req) as Record<string, unknown>
      const { quizzId, deadline, maxAttempts, requireIdentifier, showCorrectAnswers } = body

      if (typeof quizzId !== "string") {
        jsonError(res, 400, "quizzId required")
        return
      }

      // Validate quizzId exists
      try {
        getQuizzById(quizzId)
      } catch {
        jsonError(res, 404, `Quizz "${quizzId}" not found`)
        return
      }

      const id = nanoid()
      const assignment: Assignment = {
        id,
        quizzId,
        createdAt: Date.now(),
        deadline: deadline ? Number(deadline) : undefined,
        maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
        requireIdentifier: requireIdentifier === true,
        showCorrectAnswers: showCorrectAnswers === true,
      }

      const result = assignmentValidator.safeParse(assignment)
      if (!result.success) {
        jsonError(res, 400, result.error.issues[0]!.message)
        return
      }

      saveAssignment(result.data)
      jsonOk(res, { id })
    } catch (err) {
      const status = statusFrom413(err, 400)
      jsonError(res, status, err instanceof Error ? err.message : "Error")
    }
  })()
}

export const handleGetAssignment = (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  try {
    assertSafeId(id ?? "")
    const assignment = getAssignment(id!)

    if (!assignment) {
      jsonError(res, 404, "Assignment not found")
      return
    }

    jsonOk(res, assignment)
  } catch (err) {
    jsonError(res, 404, err instanceof Error ? err.message : "Not found")
  }
}

export const handleGetAssignmentResults = (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  if (!authorizeManagerRequest(_req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  try {
    assertSafeId(id ?? "")
    const assignment = getAssignment(id!)

    if (!assignment) {
      jsonError(res, 404, "Assignment not found")
      return
    }

    // Get solo results and filter by assignmentId
    const results = getSoloResults(assignment.quizzId).filter(
      (r) => (r as unknown as Record<string, unknown>).assignmentId === id,
    )

    jsonOk(res, { results })
  } catch (err) {
    jsonError(res, 404, err instanceof Error ? err.message : "Not found")
  }
}

// Helper to check assignment deadline
export const checkAssignmentDeadline = (assignmentId?: string): boolean => {
  if (!assignmentId) return true

  const assignment = getAssignment(assignmentId)
  if (!assignment) return true

  if (assignment.deadline && Date.now() > assignment.deadline) {
    return false
  }

  // I2: maxAttempts needs identifier to track per-player attempt count (not implemented in MVP)

  return true
}
