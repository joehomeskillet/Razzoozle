import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import CreamBackdrop from "@razzoozle/web/components/CreamBackdrop"
import { sanitizeAnimatedCss } from "@razzoozle/web/features/theme/sanitizeAnimatedCss"
import clsx from "clsx"
import { Eye, Trophy } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { useTranslation } from "react-i18next"

export interface ThemePreviewPanelProps {
  /** The unsaved draft theme to preview. Read-only — never persisted here. */
  theme: Theme
  className?: string
}

// Static mock data — NO game state, sockets, player names or secrets. Pure
// cosmetics so the admin sees how the draft theme reads before saving.
const MOCK_QUESTION = "Welche Farbe hat der Himmel?"
const MOCK_ANSWERS = ["Blau", "Grün", "Rot", "Gelb"]
const MOCK_PODIUM: Array<{ rank: number; score: number }> = [
  { rank: 1, score: 980 },
  { rank: 2, score: 740 },
  { rank: 3, score: 610 },
]

// A single dimmed-background mock card. The background image (if any) sits
// behind a black scrim at the draft's scrim%, mirroring <Background>. When
// `animated` is set, a scoped CreamBackdrop replaces the wallpaper (the static
// background is hidden by passing `background={null}`).
const MockCard = ({
  label,
  background,
  animated,
  children,
}: {
  label: string
  background: string | null
  animated?: { speed: number; intensity: number; iconCount: number; color: string } | null
  children: ReactNode
}) => (
  <div className="overflow-hidden rounded-[var(--radius-theme)] outline-2 -outline-offset-2 outline-[var(--border-hairline)]">
    <p className="bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-subtle)]">
      {label}
    </p>
    <div className="relative isolate h-36 overflow-hidden">
      {background ? (
        <img
          src={background}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-cover select-none"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "var(--color-field-cream)" }}
        />
      )}
      {/* Scoped animated backdrop — CreamBackdrop's root is fixed/-z-10; this
          absolute wrapper clips it to the card and pushes it behind content. */}
      {animated && (
        <div
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-60 [&>.cream-backdrop]:absolute [&>.cream-backdrop]:z-0"
          aria-hidden
        >
          <CreamBackdrop
            speed={animated.speed}
            intensity={animated.intensity}
            iconCount={animated.iconCount}
            color={animated.color}
          />
        </div>
      )}
      {background && (
        <div
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: "var(--bg-scrim)" }}
          aria-hidden
        />
      )}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-3 text-[color:var(--color-field-ink)]">
        {children}
      </div>
    </div>
  </div>
)

/**
 * A sticky right-column preview of the draft theme. Renders three small mock
 * screens (join / question / leaderboard) using ONLY the theme cosmetics.
 *
 * Isolation: every theme CSS var is scoped to this component's own wrapper via
 * an inline `style` — it NEVER writes to document.documentElement and NEVER
 * calls applyTheme, so the live app chrome is untouched while the admin
 * previews an unsaved draft.
 */
const ThemePreviewPanel = ({ theme, className }: ThemePreviewPanelProps) => {
  const { t } = useTranslation()

  const [a1, a2, a3, a4] = theme.answerColors
  const appTitle = theme.appTitle?.trim()

  // Per-screen animated configs. Old themes may predate `animated`; fall back to
  // the shipped default. A card swaps its wallpaper for the animated backdrop
  // only when its slot type is "creamBackdrop".
  const animAuth =
    theme.backgrounds.animated?.auth ?? DEFAULT_THEME.backgrounds.animated.auth
  const animPlayer =
    theme.backgrounds.animated?.playerGame ??
    DEFAULT_THEME.backgrounds.animated.playerGame
  const animManager =
    theme.backgrounds.animated?.managerGame ??
    DEFAULT_THEME.backgrounds.animated.managerGame

  const authOn = animAuth.type === "creamBackdrop"
  const playerOn = animPlayer.type === "creamBackdrop"
  const managerOn = animManager.type === "creamBackdrop"

  const customCss = sanitizeAnimatedCss(theme.backgrounds.animatedCss)

  // All theme vars live here and nowhere else — read by the var() refs below.
  const scopeStyle = {
    "--color-primary": theme.colorPrimary,
    "--color-secondary": theme.colorSecondary,
    "--color-accent": theme.accentColor,
    "--answer-1": a1,
    "--answer-2": a2,
    "--answer-3": a3,
    "--answer-4": a4,
    "--answer-text": theme.answerTextColor,
    "--bg-scrim": `${theme.scrim / 100}`,
  } as CSSProperties

  return (
    <div
      style={scopeStyle}
      className={clsx("flex w-full flex-col gap-3", className)}
    >
      {/* Reflect the editor's custom backdrop CSS inside the preview. Manager-
          trusted CSS, same trust model as the skeleton custom CSS. */}
      {customCss && <style>{customCss}</style>}
      <div className="relative isolate overflow-hidden rounded-[var(--radius-theme)] bg-[var(--surface)] p-4 shadow-sm outline-2 -outline-offset-2 outline-[var(--border-hairline)]">
        <div className="relative z-10">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="size-4 text-[var(--ink-subtle)]" aria-hidden />
          <h3 className="font-semibold text-[var(--ink)]">
            {t("manager:theme.preview.title", { defaultValue: "Vorschau" })}
          </h3>
        </div>

        <div className="flex flex-col gap-3">
          {/* ── (1) Beitritt / Join ──────────────────────────────── */}
          <MockCard
            label={t("manager:theme.preview.join", { defaultValue: "Beitritt" })}
            background={authOn ? null : theme.backgrounds.auth}
            animated={
              authOn
                ? {
                    speed: animAuth.speed,
                    intensity: animAuth.intensity,
                    iconCount: animAuth.iconCount,
                    color: animAuth.color,
                  }
                : null
            }
          >
            {theme.logo ? (
              <img
                src={theme.logo}
                alt={appTitle ?? "logo"}
                className="h-7 object-contain"
              />
            ) : (
              <p className="text-center text-base font-extrabold tracking-tight drop-shadow">
                {appTitle ?? "Razzoozle"}
              </p>
            )}
            <div className="rounded-md bg-[var(--surface)]/90 px-3 py-1 text-sm font-bold tracking-widest text-[var(--ink)]">
              123 456
            </div>
            <span
              className={"rounded-lg px-4 py-1.5 text-sm font-semibold text-white shadow" /* token-ok: stage-preview mirrors real join CTA white-on-primary (SubmitButton.tsx), design.md §2 Guardrail #5 */}
              style={{ background: "var(--color-primary)" }}
            >
              {t("manager:themePreview.join", {
                defaultValue: "Beitreten",
              })}
            </span>
            {theme.showBranding && (
              <span className="text-[10px] font-semibold text-white/50"> {/* token-ok: stage-preview watermark over image/backdrop, mirrors overlay-on-image convention */}
                {appTitle ?? "Razzoozle"}
              </span>
            )}
          </MockCard>

          {/* ── (2) Frage / Question ─────────────────────────────── */}
          <MockCard
            label={t("manager:theme.preview.question", {
              defaultValue: "Frage",
            })}
            background={playerOn ? null : theme.backgrounds.playerGame}
            animated={
              playerOn
                ? {
                    speed: animPlayer.speed,
                    intensity: animPlayer.intensity,
                    iconCount: animPlayer.iconCount,
                    color: animPlayer.color,
                  }
                : null
            }
          >
            <p className="w-full rounded-md bg-[var(--surface)]/90 px-2 py-1 text-center text-xs font-bold text-[var(--ink)]">
              {MOCK_QUESTION}
            </p>
            <div className="grid w-full grid-cols-2 gap-1.5">
              {MOCK_ANSWERS.map((answer, index) => (
                <span
                  key={answer}
                  className="truncate rounded-md px-2 py-1.5 text-xs font-bold"
                  style={{
                    background: `var(--answer-${index + 1})`,
                    color: "var(--answer-text)",
                  }}
                >
                  {answer}
                </span>
              ))}
            </div>
          </MockCard>

          {/* ── (3) Rangliste / Leaderboard ──────────────────────── */}
          <MockCard
            label={t("manager:theme.preview.leaderboard", {
              defaultValue: "Rangliste",
            })}
            background={managerOn ? null : theme.backgrounds.managerGame}
            animated={
              managerOn
                ? {
                    speed: animManager.speed,
                    intensity: animManager.intensity,
                    iconCount: animManager.iconCount,
                    color: animManager.color,
                  }
                : null
            }
          >
            <div className="flex w-full flex-col gap-1">
              {MOCK_PODIUM.map(({ rank, score }) => (
                <div
                  key={rank}
                  className={"flex items-center gap-2 rounded-md px-2 py-1 text-xs font-bold text-white shadow" /* token-ok: stage-preview mirrors real Podium.tsx white-on-accent/primary (states/Podium.tsx), design.md §2 Guardrail #5 */}
                  style={{
                    background:
                      rank === 1
                        ? "var(--color-accent)"
                        : "var(--color-primary)",
                  }}
                >
                  {rank === 1 ? (
                    <Trophy className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-[var(--surface)]/25 text-[10px]">
                      {rank}
                    </span>
                  )}
                  <span className="flex-1 truncate text-left">
                    {t("manager:themePreview.playerName", {
                      rank,
                      defaultValue: "Spieler {{rank}}",
                    })}
                  </span>
                  <span className="tabular-nums">{score}</span>
                </div>
              ))}
            </div>
          </MockCard>
        </div>
        </div>
      </div>
    </div>
  )
}

export default ThemePreviewPanel
