export const safeSwCall = (fn: () => Promise<unknown>): void => {
  fn().catch(() => undefined)
}