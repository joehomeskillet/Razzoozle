import { fetchWithAuth } from "@razzoozle/web/lib/api"

export interface ManagedUser {
  id: number
  username: string
  role: string
  active: boolean
  created_at: string
}

export interface BulkResponse {
  succeeded: number[]
  skipped: Array<{ id: number; reason: string }>
  failed: Array<{ id: number; reason: string }>
}

export const parseErrorMessage = async (
  response: Response,
): Promise<string | null> => {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === "object" && "error" in body) {
      const { error } = body as { error?: unknown }
      return typeof error === "string" ? error : null
    }
  } catch {
    // Non-JSON error body — fall back to caller's generic message
  }
  return null
}

export async function fetchUsers(): Promise<ManagedUser[]> {
  const response = await fetchWithAuth("/api/users")
  if (!response.ok) {
    throw new Error(`status ${response.status}`)
  }
  return (await response.json()) as ManagedUser[]
}

export async function createUserApi(payload: {
  username: string
  password?: string
  role: string
}): Promise<Response> {
  return fetchWithAuth("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export async function toggleUserActiveApi(id: number, active: boolean): Promise<Response> {
  const action = active ? "disable" : "enable"
  return fetchWithAuth(`/api/users/${id}/${action}`, {
    method: "POST",
  })
}

export async function resetUserPasswordApi(id: number, newPassword: string): Promise<Response> {
  return fetchWithAuth(`/api/users/${id}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  })
}

export async function deleteUserApi(id: number): Promise<Response> {
  return fetchWithAuth(`/api/users/${id}`, {
    method: "DELETE",
  })
}

export async function bulkUserActionApi(
  action: "activate" | "deactivate" | "delete",
  ids: number[],
): Promise<BulkResponse> {
  const endpoint = `/api/users/bulk-${action}`
  const response = await fetchWithAuth(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })

  if (!response.ok) {
    throw new Error(`status ${response.status}`)
  }

  return (await response.json()) as BulkResponse
}
