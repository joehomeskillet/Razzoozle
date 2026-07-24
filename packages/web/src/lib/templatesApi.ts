import { Question } from "@razzoozle/common"
import { fetchWithAuth } from "./api"

/** Template metadata returned by GET /api/templates */
export type TemplateMeta = {
  id: string
  category: string
  name: string
  description: string
  tags: string[]
  questionCount: number
}

/** Full template with questions, returned by GET /api/templates/:id */
export type TemplateFull = TemplateMeta & {
  questions: Question[]
}

/** Body for POST /api/templates and PUT /api/templates/:id (without fromQuizId) */
export type TemplateWriteBody = {
  name: string
  category: string
  description: string
  tags: string[]
  questions: Question[]
}

/** Body for POST /api/templates (with optional fromQuizId) */
export type TemplateCreateBody = TemplateWriteBody & {
  fromQuizId?: string
}

/**
 * List all templates (metadata only).
 * GET /api/templates
 */
export const listTemplates = async (): Promise<TemplateMeta[]> => {
  const response = await fetchWithAuth("/api/templates")
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to list templates: ${text}`)
  }
  return response.json()
}

/**
 * Get a single template with its questions.
 * GET /api/templates/:id
 */
export const getTemplate = async (id: string): Promise<TemplateFull> => {
  const response = await fetchWithAuth(`/api/templates/${encodeURIComponent(id)}`)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to get template: ${text}`)
  }
  return response.json()
}

/**
 * Create a new template. Requires admin role.
 * POST /api/templates
 */
export const createTemplate = async (
  body: TemplateCreateBody,
): Promise<TemplateFull> => {
  const response = await fetchWithAuth("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to create template: ${text}`)
  }
  return response.json()
}

/**
 * Update an existing template. Requires admin role.
 * PUT /api/templates/:id
 */
export const updateTemplate = async (
  id: string,
  body: TemplateWriteBody,
): Promise<TemplateFull> => {
  const response = await fetchWithAuth(`/api/templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to update template: ${text}`)
  }
  return response.json()
}

/**
 * Delete a template. Requires admin role.
 * DELETE /api/templates/:id
 */
export const deleteTemplate = async (id: string): Promise<void> => {
  const response = await fetchWithAuth(`/api/templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to delete template: ${text}`)
  }
}

/**
 * Create a new quiz from a template.
 * POST /api/templates/create-from
 */
export const createQuizFromTemplate = async (
  templateId: string,
  subject?: string,
): Promise<{ id: string }> => {
  const response = await fetchWithAuth("/api/templates/create-from", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateId,
      ...(subject && { subject }),
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to create quiz from template: ${text}`)
  }
  return response.json()
}
