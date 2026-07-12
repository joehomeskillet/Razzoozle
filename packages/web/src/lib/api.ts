import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"

/**
 * Fetch wrapper that adds Authorization Bearer header if token exists in manager store.
 * Falls back to regular fetch if no token is available.
 */
export const fetchWithAuth = async (
  path: string,
  options?: RequestInit,
): Promise<Response> => {
  const store = useManagerStore.getState()
  const token = store.token

  const headers = new Headers(options?.headers ?? {})

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  return fetch(path, {
    ...options,
    headers,
  })
}
