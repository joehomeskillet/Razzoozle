import type { SVGProps } from "react"

/**
 * UmbrellaShieldIcon — WP-C-3 power-up SVG set (Regenschirm).
 *
 * Comic-stilised umbrella canopy with three rib lines and a hooked handle.
 * Inherits `stroke="currentColor"` so the calling vote-button can colorise
 * it via Tailwind classes (e.g. `text-accent-tint`). Mirrors the carrier
 * contract of `POWERUP_ICONS` (packages/.../flower-battle.types.ts).
 */
export default function UmbrellaShieldIcon(
  props: SVGProps<SVGSVGElement>,
) {
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
      {/* Canopy (umbrella top) */}
      <path d="M3 13 Q3 8 7 6 Q11 4 12 4 Q13 4 17 6 Q21 8 21 13 Z" />
      {/* Bottom edge of the canopy */}
      <path d="M3 13 L21 13" />
      {/* Centre rib (apex to handle anchor) */}
      <path d="M12 4 L12 13" />
      {/* Two side ribs */}
      <path d="M7 13 Q8.5 10 12 4" />
      <path d="M17 13 Q15.5 10 12 4" />
      {/* Handle stem + hook */}
      <path d="M12 13 L12 19" />
      <path d="M12 19 Q12 21 10 21" />
    </svg>
  )
}
