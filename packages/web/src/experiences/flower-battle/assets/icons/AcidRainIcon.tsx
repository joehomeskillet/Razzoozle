import type { SVGProps } from "react"

/**
 * AcidRainIcon — WP-C-3 power-up SVG set (Saurer Regen).
 *
 * Comic-stilised grumpy rain cloud with three downward droplets. The cloud
 * carries a slight frown so the negative connotation reads at small sizes
 * (24×24) without resorting to platform emoji (forbidden by design.md §25).
 * Inherits `stroke="currentColor"` so the calling vote-button can colorise
 * it via Tailwind classes (e.g. `text-accent-tint`). Mirrors the carrier
 * contract of `POWERUP_ICONS` (packages/.../flower-battle.types.ts).
 */
export default function AcidRainIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* Cloud silhouette (three bumps + flat base) */}
      <path d="M6 15 Q3 15 3 12 Q3 9 6 9 Q7 6 10 6 Q12 4 14 5 Q16 4 18 6 Q21 7 21 10 Q21 15 18 15 Z" />
      {/* Frown under the cloud (gives the negative read) */}
      <path d="M8 13 Q10 11 12 13" />
      {/* Three raindrops */}
      <path d="M8 19 L7 22" />
      <path d="M12 19 L11 22" />
      <path d="M16 19 L15 22" />
    </svg>
  )
}
