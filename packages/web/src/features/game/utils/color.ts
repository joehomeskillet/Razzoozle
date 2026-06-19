// Valid #rgb / #rrggbb hex, else the provided fallback. Trims whitespace.
export const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function safeHex(
  hex: string | null | undefined,
  fallback: string,
): string {
  return typeof hex === "string" && HEX_RE.test(hex.trim())
    ? hex.trim()
    : fallback
}
