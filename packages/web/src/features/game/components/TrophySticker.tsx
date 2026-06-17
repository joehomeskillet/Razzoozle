/**
 * TrophySticker — a STATIC, rasterizable "trophy sticker" card for the top 1–3
 * players of a finished multiplayer game. Designed to be snapshotted to PNG via
 * `useStickerExport` (modern-screenshot / SVG-foreignObject) and handed to the
 * native share sheet.
 *
 * HARD CONSTRAINTS (see docs/design/trophy-sticker.md §4):
 *   1. NO motion/react, NO @keyframes / animation / transition, NO confetti.
 *      foreignObject snapshots a single frame — animated nodes capture blank or
 *      mid-transition. Everything here renders in its resting (visible) state.
 *   2. EVERY color on the capture subtree is a literal #rrggbb / rgb() / rgba()
 *      via inline `style`. NO `var(--…)`, NO Tailwind v4 @theme utility classes
 *      (those emit oklch()), NO color-mix(). The theme's oklch palette does not
 *      survive foreignObject serialization. All gradient stops + tints are
 *      pre-computed to hex/rgba in JS below.
 *   3. System font stack only — the app's Rubik webfont may not have loaded at
 *      capture time, which would shift the layout.
 *   4. Fixed px dimensions on the capture root (540×540 logical for square,
 *      540×960 for story; pixelRatio 2 → 1080² / 1080×1920 emitted).
 *
 * Reads the active theme via useThemeStore but RESOLVES every token to inline
 * hex/rgb with the spec's fallbacks. Visible text labels (honorific, points
 * unit) come from i18n `t()` so the exported PNG is localized to the active
 * locale; the i18n bundle is already loaded at capture time (plain text, no
 * webfont/oklch concern).
 */

import { useThemeStore } from "@razzoozle/web/features/theme/store"
import {
  ACHIEVEMENT_META,
  type AchievementTier,
} from "@razzoozle/web/features/game/utils/achievements"
import { useTranslation } from "react-i18next"

// ─── Format presets (logical px; pixelRatio 2 emits double) ───────────────────

export type StickerFormat = "square" | "story"

interface FormatSpec {
  width: number
  height: number
}

const FORMATS: Record<StickerFormat, FormatSpec> = {
  square: { width: 540, height: 540 },
  story: { width: 540, height: 960 },
}

// ─── Props (contract) ─────────────────────────────────────────────────────────

export interface TrophyStickerProps {
  rank: 1 | 2 | 3
  name: string
  points: number
  subject: string
  achievements?: string[]
  format?: StickerFormat
}

// ─── Fallback hex (spec §3) ───────────────────────────────────────────────────

const FALLBACK = {
  bgStart: "#2e1065", // colorSecondary
  bgEnd: "#7c3aed", // colorPrimary
  text: "#ffffff", // colorText
  accent: "#ff9900", // accentColor
  footerBg: "#ffffff",
  footerText: "#1f2937",
  tier: {
    gold: "#eab308",
    silver: "#9ca3af",
    bronze: "#b45309",
  } as Record<"gold" | "silver" | "bronze", string>,
} as const

const RANK_TIER: Record<1 | 2 | 3, "gold" | "silver" | "bronze"> = {
  1: "gold",
  2: "silver",
  3: "bronze",
}

// ─── Color helpers — resolve to literal #rrggbb / rgba(), never color-mix ─────

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Returns `hex` if it's a valid #rgb/#rrggbb string, else `fallback`. */
function safeHex(hex: string | null | undefined, fallback: string): string {
  return typeof hex === "string" && HEX_RE.test(hex.trim())
    ? hex.trim()
    : fallback
}

/** Parses #rgb / #rrggbb → [r,g,b] (0–255). Assumes already validated. */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "")
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => clamp255(v).toString(16).padStart(2, "0")
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Lighten toward white by `amt` (0–1) — emits a literal hex, NOT color-mix. */
function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt)
}

/** Darken toward black by `amt` (0–1) — emits a literal hex, NOT color-mix. */
function darken(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  return toHex(r * (1 - amt), g * (1 - amt), b * (1 - amt))
}

/** Pre-mixed rgba string from a hex + alpha — replaces color-mix / opacity utils. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Inline-hex tier disc gradient (spec §3.1) — no Tailwind gradient classes. */
function discGradient(tierHex: string): string {
  return `linear-gradient(135deg, ${lighten(tierHex, 0.18)} 0%, ${tierHex} 55%, ${darken(tierHex, 0.22)} 100%)`
}

// Capture-safe system font stack (spec §4 constraint 3).
const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

// German thousands grouping for the points number.
const POINTS_FMT = new Intl.NumberFormat("de-DE")

// ─── Static mini-medallion (achievements row) ─────────────────────────────────
// Inline-hex variant of AchievementMedal's visual language: tier-gradient disc,
// light ring, static sheen, centered emoji glyph. No motion.

interface MiniMedalProps {
  icon: string
  tierHex: string
  size: number
}

const MiniMedal = ({ icon, tierHex, size }: MiniMedalProps) => (
  <span
    style={{
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "9999px",
      background: discGradient(tierHex),
      border: `2px solid ${rgba("#ffffff", 0.55)}`,
      boxShadow: `0 2px 6px ${rgba("#000000", 0.25)}`,
      overflow: "hidden",
    }}
  >
    {/* Static diagonal sheen */}
    <span
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(135deg, ${rgba("#ffffff", 0.3)} 0%, ${rgba("#ffffff", 0)} 55%)`,
      }}
    />
    <span
      style={{
        position: "relative",
        lineHeight: 1,
        fontSize: `${Math.round(size * 0.5)}px`,
      }}
    >
      {icon}
    </span>
  </span>
)

// ─── Component ────────────────────────────────────────────────────────────────

const TrophySticker = ({
  rank,
  name,
  points,
  subject,
  achievements,
  format = "square",
}: TrophyStickerProps) => {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const { width, height } = FORMATS[format]
  const isStory = format === "story"

  // Localized visible labels (resolved synchronously — bundle is loaded by
  // capture time). Honorific falls back to the rank's own key per locale.
  const honorific = t(`game:recap.sticker.honorific.${rank}`)
  const pointsUnit = t("game:recap.sticker.points")

  // ── Resolve every token to a literal hex/rgba (spec §3) ──
  const bgStart = safeHex(theme.colorSecondary, FALLBACK.bgStart)
  const bgEnd = safeHex(theme.colorPrimary, FALLBACK.bgEnd)
  const textColor = safeHex(theme.colorText, FALLBACK.text)
  const accent = safeHex(theme.accentColor, FALLBACK.accent)
  const footerBg = safeHex(theme.footerColors?.bg, FALLBACK.footerBg)
  const footerText = safeHex(theme.footerColors?.text, FALLBACK.footerText)

  const tierKey = RANK_TIER[rank]
  const tierHex = safeHex(theme.tierColors?.[tierKey], FALLBACK.tier[tierKey])

  const textMuted = rgba(textColor, 0.7)
  const subjectColor = rgba(textColor, 0.8)

  // Branding: appTitle text, fall back to "Razzoozle". Logo is rendered same-origin
  // (spec §4.6); a missing/broken logo falls back to the appTitle/Razzoozle text.
  const appTitle = theme.appTitle?.trim() || "Razzoozle"
  const logo = theme.logo ?? null

  // Optional achievements row — max 3 shown, resolved to per-tier hex.
  const shownAchievements = (achievements ?? [])
    .map((id) => {
      const meta = ACHIEVEMENT_META[id]
      if (!meta) return null
      const t = meta.tier as AchievementTier
      // Diamant maps to the theme diamant token; the 3 podium tiers use spec hex.
      const aTierHex = safeHex(
        theme.tierColors?.[t],
        t === "diamant"
          ? "#38bdf8"
          : FALLBACK.tier[t as "gold" | "silver" | "bronze"],
      )
      return { id, icon: meta.icon ?? "🏅", tierHex: aTierHex }
    })
    .filter(
      (x): x is { id: string; icon: string; tierHex: string } => x !== null,
    )
    .slice(0, 3)

  // Size tokens scale modestly for the taller story frame.
  const discSize = isStory ? 260 : 200
  const numeralSize = isStory ? 110 : 88
  const nameSize = isStory ? 44 : 38
  const pointsSize = isStory ? 56 : 48
  const miniSize = isStory ? 56 : 46

  return (
    <div
      id="trophy-sticker-capture"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        fontFamily: FONT_STACK,
        color: textColor,
        background: `linear-gradient(135deg, ${bgStart} 0%, ${bgEnd} 100%)`,
        // Solid fallback so transparent areas never produce a black PNG.
        backgroundColor: bgStart,
      }}
    >
      {/* ── Branding header: logo + appTitle (left), rank badge (right) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "28px 32px 0 32px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {logo ? (
            <img
              src={logo}
              alt={appTitle}
              crossOrigin="anonymous"
              style={{
                height: "40px",
                width: "auto",
                objectFit: "contain",
              }}
            />
          ) : null}
          <span
            style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: textColor,
            }}
          >
            {appTitle}
          </span>
        </div>

        {/* Rank badge pill — tier-tinted */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 14px",
            borderRadius: "9999px",
            background: rgba(tierHex, 0.92),
            border: `2px solid ${lighten(tierHex, 0.35)}`,
            boxShadow: `0 2px 8px ${rgba("#000000", 0.25)}`,
          }}
        >
          <span style={{ fontSize: "18px", lineHeight: 1 }}>🏆</span>
          <span
            style={{
              fontSize: "18px",
              fontWeight: 800,
              color: "#ffffff",
              textShadow: `1px 1px ${rgba("#000000", 0.25)}`,
            }}
          >
            {t("game:recap.sticker.rankBadge", { rank })}
          </span>
        </div>
      </div>

      {/* ── Center column: honorific → medal → name → points → subject ── */}
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 32px",
          gap: isStory ? "22px" : "16px",
        }}
      >
        <span
          style={{
            fontSize: "15px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: textMuted,
          }}
        >
          {honorific}
        </span>

        {/* Big static medal disc — AchievementMedal visual language, inline hex */}
        <div
          style={{
            position: "relative",
            width: `${discSize}px`,
            height: `${discSize}px`,
            borderRadius: "9999px",
            background: discGradient(tierHex),
            border: `6px solid ${rgba("#ffffff", 0.55)}`,
            boxShadow: `0 10px 30px ${rgba("#000000", 0.35)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* Outer ring tint from the rank tier */}
          <span
            style={{
              position: "absolute",
              inset: "10px",
              borderRadius: "9999px",
              border: `3px solid ${rgba(lighten(tierHex, 0.45), 0.7)}`,
            }}
          />
          {/* Static diagonal sheen (two bands, like the Podium medal) */}
          <span
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, ${rgba("#ffffff", 0.3)} 0%, ${rgba("#ffffff", 0)} 50%)`,
            }}
          />
          <span
            style={{
              position: "relative",
              fontSize: `${numeralSize}px`,
              fontWeight: 900,
              color: textColor,
              lineHeight: 1,
              textShadow: `2px 2px ${rgba("#000000", 0.3)}`,
            }}
          >
            {rank}
          </span>
        </div>

        {/* Player name + accent underline flourish */}
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              fontSize: `${nameSize}px`,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: textColor,
              maxWidth: `${width - 80}px`,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textShadow: `0 2px 8px ${rgba("#000000", 0.25)}`,
            }}
          >
            {name}
          </span>
          <span
            style={{
              display: "block",
              width: "72px",
              height: "4px",
              borderRadius: "9999px",
              backgroundColor: accent,
            }}
          />
        </div>

        {/* Points — tabular figures via fontVariantNumeric */}
        <span
          style={{
            fontSize: `${pointsSize}px`,
            fontWeight: 900,
            color: textColor,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {POINTS_FMT.format(points)}{" "}
          <span
            style={{
              fontSize: `${Math.round(pointsSize * 0.45)}px`,
              fontWeight: 700,
              color: textMuted,
            }}
          >
            {pointsUnit}
          </span>
        </span>

        {/* Quiz subject — quiet caption in German quotation marks */}
        <span
          style={{
            fontSize: "20px",
            fontWeight: 600,
            color: subjectColor,
            maxWidth: `${width - 80}px`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          „{subject}“
        </span>

        {/* Optional achievements row (up to 3 static mini-medallions) */}
        {shownAchievements.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              marginTop: isStory ? "8px" : "2px",
            }}
          >
            {shownAchievements.map((a) => (
              <MiniMedal
                key={a.id}
                icon={a.icon}
                tierHex={a.tierHex}
                size={miniSize}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Watermark footer: attribution (left), wordmark (right) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 32px",
          backgroundColor: footerBg,
          color: footerText,
        }}
      >
        <span style={{ fontSize: "15px", fontWeight: 600, color: footerText }}>
          Gespielt mit Razzoozle
        </span>
        <span
          style={{
            fontSize: "16px",
            fontWeight: 800,
            letterSpacing: "0.02em",
            color: footerText,
          }}
        >
          razzoozle
        </span>
      </div>
    </div>
  )
}

export default TrophySticker
