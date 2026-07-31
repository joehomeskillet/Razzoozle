import type { SVGProps } from "react"

/**
 * SunbeamIcon — WP-C-3 power-up SVG set (Sonnenstrahl).
 *
 * Comic-stilised sun with 8 directed rays. Inherits `stroke="currentColor"`
 * so the calling vote-button can colorise it via Tailwind classes (e.g.
 * `text-accent-tint`). Mirrors the carrier contract of `POWERUP_ICONS`
 * (packages/.../flower-battle.types.ts).
 */
export default function SunbeamIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* Sun body */}
      <circle cx="12" cy="12" r="4" />
      {/* Cardinal rays */}
      <path d="M12 3 L12 5.5" />
      <path d="M12 18.5 L12 21" />
      <path d="M3 12 L5.5 12" />
      <path d="M18.5 12 L21 12" />
      {/* Diagonal rays (45°) */}
      <path d="M5.6 5.6 L7.4 7.4" />
      <path d="M16.6 16.6 L18.4 18.4" />
      <path d="M5.6 18.4 L7.4 16.6" />
      <path d="M16.6 7.4 L18.4 5.6" />
    </svg>
  )
}
