import type { SVGProps } from "react"

/**
 * FertilizerIcon — WP-C-3 power-up SVG set (Dünger).
 *
 * Comic-stilised fertiliser sack with a leaf emblem on the front. Inherits
 * `stroke="currentColor"` so the calling vote-button can colorise it via
 * Tailwind classes (e.g. `text-accent-tint`). Mirrors the carrier contract
 * of `POWERUP_ICONS` (packages/.../flower-battle.types.ts) — the data layer
 * treats every power-up icon as an opaque `ComponentType<SVGProps<...>>`.
 */
export default function FertilizerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Cinched neck of the sack */}
      <path d="M9.5 7 L9.5 4 Q9.5 3 10.5 3 L13.5 3 Q14.5 3 14.5 4 L14.5 7" />
      {/* Sack body (rounded base) */}
      <path d="M5 8 L19 8 L19 19 Q19 21 17 21 L7 21 Q5 21 5 19 Z" />
      {/* Leaf emblem on the front */}
      <path d="M12 18 C 8 18, 8 13, 12 11 C 16 13, 16 18, 12 18 Z" />
      {/* Leaf centre vein */}
      <path d="M12 11 L12 18" />
    </svg>
  )
}
