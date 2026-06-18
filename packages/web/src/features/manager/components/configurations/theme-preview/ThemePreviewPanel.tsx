import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import CreamBackdrop from "@razzoozle/web/components/CreamBackdrop"
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
// behind a black scrim at the draft's scrim%, mirroring <Background>.
const MockCard = ({
  label,
  background,
  children,
}: {
  label: string
  background: string | null
  children: ReactNode
}) => (
  <div className="overflow-hidden rounded-xl outline-2 -outline-offset-2 outline-gray-200">
    <p className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500">
      {label}
    </p>
    <div className="relative isolate h-36">
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
          style={{
            background:
              "linear-gradient(135deg, var(--color-secondary), var(--color-primary))",
          }}
        />
      )}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: "var(--bg-scrim)" }}
        aria-hidden
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-white">
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

  // Old themes may predate `animated`; fall back to the shipped default.
  const animatedAuth =
    theme.backgrounds.animated?.auth ??
    DEFAULT_THEME.backgrounds.animated.auth

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
      <div className="relative isolate overflow-hidden rounded-2xl bg-white p-4 shadow-sm outline-2 -outline-offset-2 outline-gray-200">
        {/* Scoped animated backdrop — subtle preview of the auth-slot config.
            CreamBackdrop's root is fixed/-z-10; this absolute wrapper clips it to
            the card. Rendered only when the slot's type is creamBackdrop. */}
        {animatedAuth.type === "creamBackdrop" && (
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-60 [&>.cream-backdrop]:absolute [&>.cream-backdrop]:z-0"
            aria-hidden
          >
            <CreamBackdrop
              speed={animatedAuth.speed}
              intensity={animatedAuth.intensity}
              iconCount={animatedAuth.iconCount}
            />
          </div>
        )}

        <div className="relative z-10">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="size-4 text-gray-500" aria-hidden />
          <h3 className="font-semibold text-gray-900">
            {t("manager:theme.preview.title", { defaultValue: "Vorschau" })}
          </h3>
        </div>

        <div className="flex flex-col gap-3">
          {/* ── (1) Beitritt / Join ──────────────────────────────── */}
          <MockCard
            label={t("manager:theme.preview.join", { defaultValue: "Beitritt" })}
            background={theme.backgrounds.auth}
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
            <div className="rounded-md bg-white/90 px-3 py-1 text-sm font-bold tracking-widest text-gray-900">
              123 456
            </div>
            <span
              className="rounded-lg px-4 py-1.5 text-sm font-semibold text-white shadow"
              style={{ background: "var(--color-primary)" }}
            >
              {t("manager:themePreview.join", {
                defaultValue: "Beitreten",
              })}
            </span>
            {theme.showBranding && (
              <span className="text-[10px] font-semibold text-white/50">
                {appTitle ?? "Razzoozle"}
              </span>
            )}
          </MockCard>

          {/* ── (2) Frage / Question ─────────────────────────────── */}
          <MockCard
            label={t("manager:theme.preview.question", {
              defaultValue: "Frage",
            })}
            background={theme.backgrounds.playerGame}
          >
            <p className="w-full rounded-md bg-white/90 px-2 py-1 text-center text-xs font-bold text-gray-900">
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
            background={theme.backgrounds.managerGame}
          >
            <div className="flex w-full flex-col gap-1">
              {MOCK_PODIUM.map(({ rank, score }) => (
                <div
                  key={rank}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-bold text-white shadow"
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
                    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-white/25 text-[10px]">
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
