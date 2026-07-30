/**
 * Best-effort fire-and-forget for SW lifecycle calls.
 * Swallows both synchronous throws from `fn` and rejections from the
 * returned promise so callers never surface unhandled rejections.
 */
export const safeSwCall = (fn: () => Promise<unknown>): void => {
  try {
    void Promise.resolve(fn()).catch(() => undefined)
  } catch {
    // Synchronous throw from fn() — swallow; SW probes are best-effort.
  }
}
