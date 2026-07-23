import type { ManagerRecap } from "@razzoozle/common/types/game"
import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Avatar from "@razzoozle/web/components/Avatar"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import AchievementMedal from "@razzoozle/web/features/game/components/AchievementMedal"
import RecapSequence from "@razzoozle/web/features/game/components/RecapSequence"
import TeamLeaderboard from "@razzoozle/web/features/game/components/TeamLeaderboard"
import TrophySticker from "@razzoozle/web/features/game/components/TrophySticker"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { ACHIEVEMENT_META } from "@razzoozle/web/features/game/utils/achievements"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import useStickerExport from "@razzoozle/web/features/game/utils/useStickerExport"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import useScreenSize from "@razzoozle/web/hooks/useScreenSize"
import clsx from "clsx"
import { Sparkles } from "lucide-react"
import { motion } from "motion/react"
import { Suspense, lazy, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

// react-confetti is lazy-loaded into its own chunk: it is only rendered once the
// podium fully reveals, never on first paint, so it stays out of the eager bundle.
const ReactConfetti = lazy(() => import("react-confetti"))

interface Props {
  data: ManagerStatusDataMap["FINISHED"]
}

/** ManagerRecap is discriminated from PlayerRecap by the `superlatives` array. */
function isManagerRecap(
  recap: ManagerStatusDataMap["FINISHED"]["recap"],
): recap is ManagerRecap {
  return (
    !!recap &&
    "superlatives" in recap &&
    Array.isArray((recap as ManagerRecap).superlatives)
  )
}

const usePodiumAnimation = (topLength: number, enabled: boolean) => {
  const [apparition, setApparition] = useState(0)
  const muted = useSoundStore((s) => s.muted)

  const threeUrl = useSoundUrl("podiumThree")
  const secondUrl = useSoundUrl("podiumSecond")
  const snearRollUrl = useSoundUrl("podiumSnearRoll")
  const firstUrl = useSoundUrl("podiumFirst")
  const [sfxtThree] = useSound(threeUrl, {
    volume: 0.1,
    soundEnabled: !muted,
  })
  const [sfxSecond] = useSound(secondUrl, {
    volume: 0.1,
    soundEnabled: !muted,
  })
  const [sfxRool, { stop: sfxRoolStop }] = useSound(snearRollUrl, {
    volume: 0.1,
    soundEnabled: !muted,
  })
  const [sfxFirst] = useSound(firstUrl, {
    volume: 0.1,
    soundEnabled: !muted,
  })

  useEffect(() => {
    const actions: Partial<Record<number, () => void>> = {
      4: () => {
        sfxRoolStop()
        sfxFirst()
      },
      3: sfxRool,
      2: sfxSecond,
      1: sfxtThree,
    }

    actions[apparition]?.()
  }, [apparition, sfxFirst, sfxSecond, sfxtThree, sfxRool, sfxRoolStop])

  useEffect(() => {
    // Hold the podium hidden while the recap sequence is still playing.
    if (!enabled) {
      return
    }

    if (topLength < 3) {
      setApparition(4)

      return
    }

    if (apparition >= 4) {
      return
    }

    const interval = setInterval(() => {
      setApparition((value) => value + 1)
    }, 2000)

    return () => clearInterval(interval)
  }, [apparition, topLength, enabled])

  return apparition
}

const medalColor = [
  {
    background: "bg-[var(--tier-gold)]",
    border: "border-[var(--tier-gold)]",
    // gold tier → ink label (ink reads on the light-gold fill)
    text: "text-[color:var(--color-field-ink)]",
  },
  {
    background: "bg-[var(--tier-silver)]",
    border: "border-[var(--tier-silver)]",
    // silver tier → ink label
    text: "text-[color:var(--color-field-ink)]",
  },
  {
    background: "bg-[var(--tier-bronze)]",
    border: "border-[var(--tier-bronze)]",
    // bronze tier → white label
    text: "text-white",
  },
]

const Medal = ({ rank }: { rank: number }) => {
  const color = medalColor[rank - 1]

  return (
    <div
      className={clsx(
        "relative flex aspect-square size-20 items-center justify-center overflow-hidden rounded-full border-8 text-5xl font-extrabold md:size-26 md:border-10 md:text-6xl",
        color.background,
        color.border,
        color.text,
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <div className="absolute top-[30%] left-1/2 h-6 w-[160%] -translate-x-1/2 -rotate-40 bg-white/60" />
        <div className="absolute top-[70%] left-1/2 h-3 w-[160%] -translate-x-1/2 -rotate-40 bg-white/60" />
      </div>
      <p className="relative z-10">{rank}</p>
    </div>
  )
}

// ─── Achievement medal row (per podium block) ─────────────────────────────────
// Carousel of player's achievements. When autoMode is on and player has >3 badges,
// cycles through all achievements every 3 seconds. Otherwise shows first 3 static.
// Skips ids absent from the static meta catalog.

const PodiumMedals = ({
  achievements,
  autoMode = false,
  isRevealed = false
}: {
  achievements?: string[]
  autoMode?: boolean
  isRevealed?: boolean
}) => {
  const [carouselIndex, setCarouselIndex] = useState(0)

  const shown = useMemo(() => (achievements ?? [])
    .map((id) => ({ id, meta: ACHIEVEMENT_META[id] }))
    .filter((x): x is { id: string; meta: (typeof ACHIEVEMENT_META)[string] } =>
      Boolean(x.meta),
    ), [achievements])

  if (shown.length === 0) return null

  // Set up carousel auto-advance when autoMode is on and podium is revealed
  useEffect(() => {
    if (!autoMode || shown.length <= 3 || !isRevealed) {
      return
    }

    const interval = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % shown.length)
    }, 3000) // Rotate every 3 seconds

    return () => clearInterval(interval)
  }, [autoMode, shown.length, isRevealed])

  // Reset carousel when auto mode turns off
  useEffect(() => {
    if (!autoMode) {
      setCarouselIndex(0)
    }
  }, [autoMode, shown.length])

  // Determine which achievements to show (carousel or static)
  const displayed = autoMode && shown.length > 3
    ? [shown[(carouselIndex) % shown.length],
       shown[(carouselIndex + 1) % shown.length],
       shown[(carouselIndex + 2) % shown.length]]
    : shown.slice(0, 3)

  return (
    <div className="flex items-center justify-center gap-2 pt-3">
      {displayed.map(({ id, meta }) => (
        <AchievementMedal key={id} id={id} tier={meta.tier} size="sm" />
      ))}
    </div>
  )
}

// ─── Sticker share button (per podium block) ──────────────────────────────────
// Renders a hidden TrophySticker for the player offscreen and exports it via the
// two-tap pattern (generate on tap 1 while the node is mounted, share on tap 2)
// so Safari's user-gesture requirement survives the slow capture.

interface StickerButtonProps {
  rank: 1 | 2 | 3
  name: string
  points: number
  subject: string
  achievements?: string[]
}

const PodiumStickerButton = ({
  rank,
  name,
  points,
  subject,
  achievements,
}: StickerButtonProps) => {
  const { t } = useTranslation()
  const colorSecondary = useThemeStore((s) => s.theme.colorSecondary)
  const { generateSticker, shareGenerated, hasGenerated, isExporting } =
    useStickerExport()
  const [nodeId] = useState(
    () => `trophy-sticker-host-${rank}-${Math.random().toString(36).slice(2)}`,
  )

  const handleClick = async () => {
    const options = {
      backgroundColor: colorSecondary || "#2e1065",
      fileName: `razzoozle-trophy-${rank}`,
    }
    try {
      if (!hasGenerated) {
        // Tap 1 — rasterize while the node is mounted/visible offscreen.
        const node = document.getElementById(nodeId)
        if (!node) return
        await generateSticker(node, options)
        return
      }
      // Tap 2 — share the cached blob inside a fresh user gesture.
      const outcome = await shareGenerated(options)
      const msg =
        outcome === "shared"
          ? t("game:recap.sticker.shared")
          : outcome === "copied"
            ? t("game:recap.sticker.copied", {
                defaultValue: "In die Zwischenablage kopiert",
              })
            : t("game:recap.sticker.downloaded", {
                defaultValue: "Heruntergeladen",
              })
      toast.success(msg)
    } catch (err) {
      // A user-cancelled share is not a failure — do not toast.
      if (err instanceof Error && err.name === "AbortError") return
      toast.error(
        t("game:recap.sticker.error", {
          defaultValue: "Sticker konnte nicht erstellt werden",
        }),
      )
    }
  }

  const label = isExporting
    ? t("game:recap.sticker.creating", {
        defaultValue: "Sticker wird erstellt …",
      })
    : hasGenerated
      ? t("game:recap.sticker.share")
      : t("game:recap.sticker.create")

  return (
    <>
      {/* Hidden capture subtree — mounted offscreen at fixed logical px. */}
      <div
        id={nodeId}
        style={{
          position: "fixed",
          left: -99999,
          top: 0,
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <TrophySticker
          rank={rank}
          name={name}
          points={points}
          subject={subject}
          achievements={achievements}
        />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={isExporting}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-white px-3 py-1.5 text-sm font-semibold text-[color:var(--color-field-ink)] shadow-sm transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/60 focus-visible:outline-none disabled:opacity-60"
      >
        <Sparkles className="size-4" aria-hidden />
        {label}
      </button>
    </>
  )
}

// ─── Single Winner Layout ────────────────────────────────────────────────────
// Compact, centered layout for a single player winner.
interface SingleWinnerProps {
  player: ManagerStatusDataMap["FINISHED"]["top"][0]
  subject: string
  autoMode: boolean
  apparition: number
  reveal: ReturnType<typeof useReveal>
}

const SingleWinner = ({
  player: p,
  subject,
  autoMode,
  apparition,
  reveal,
}: SingleWinnerProps) => {
  const { t } = useTranslation()

  return (
    <motion.div
      variants={reveal.item(96)}
      initial="hidden"
      animate={apparition >= 3 ? "visible" : "hidden"}
      transition={reveal.spring}
      className="flex flex-1 flex-col items-center justify-center gap-6"
    >
      <Avatar
        src={p.avatar}
        name={p.username}
        size={128}
        className="mx-auto"
      />

      <div className="text-center">
        <p className="text-lg font-semibold text-[color:var(--color-accent)] mb-2">
          {t("game:podium.firstPlace")}
        </p>
        <p className="text-3xl font-bold text-[color:var(--game-fg)] md:text-4xl lg:text-5xl">
          {p.username}
        </p>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-lg bg-[var(--color-accent)] px-6 py-4 text-center text-white shadow-lg">
        <p className="text-sm font-semibold opacity-90">
          {t("game:podium.points")}
        </p>
        <p className="text-5xl font-bold tabular-nums drop-shadow-sm">
          {p.points}
        </p>
      </div>

      <PodiumMedals achievements={p.achievements} autoMode={autoMode} isRevealed={apparition >= 3} />

      {apparition >= 4 && (
        <PodiumStickerButton
          rank={1}
          name={p.username}
          points={p.points}
          subject={subject}
          achievements={p.achievements}
        />
      )}
    </motion.div>
  )
}

const Podium = ({
  data: { subject, top: allPlayers, teamStandings, recap, autoMode, endScreen },
}: Props) => {
  // W1-M3b: "top3" mode caps the podium at the top 3 players. "full" and
  // "private" are unchanged here — the manager always sees the full result
  // (private only hides the public ranking on the PLAYER's screen).
  const top = endScreen === "top3" ? allPlayers.slice(0, 3) : allPlayers

  // Manager view: play the superlative recap BEFORE the podium when present.
  const managerRecap = isManagerRecap(recap) ? recap : null
  const hasRecap = !!managerRecap && managerRecap.superlatives.length > 0
  const [recapDone, setRecapDone] = useState(!hasRecap)

  const apparition = usePodiumAnimation(top.length, recapDone)

  const { width, height } = useScreenSize()
  const reveal = useReveal()
  // Lifecycle rise distance — the podium blocks lift up from below as each
  // tier reveals. Opacity-only when reduced (reveal.item handles the guard).
  const RISE = 96

  // Rank → sticker tier mapping (1-based podium order).
  const rankOf = useMemo(() => ({ 0: 1, 1: 2, 2: 3 }) as const, [])

  const { t } = useTranslation()

  const topThree = top.slice(0, 3)
  const rankingList = top.slice(3)
  const showRankingList = endScreen === "full" && rankingList.length > 0

  return (
    <>
      {/* Superlative recap reveal — overlays the podium until it completes. */}
      {/* #76: terminal recap always auto-plays to the podium, independent of the */}
      {/* in-game manual/auto pacing toggle (same as RoundRecap). */}
      {hasRecap && !recapDone && (
        <RecapSequence
          superlatives={managerRecap.superlatives}
          autoMode
          onComplete={() => setRecapDone(true)}
        />
      )}

      {apparition >= 4 && !reveal.reduced && (
        <Suspense fallback={null}>
          <ReactConfetti
            width={width}
            height={height}
            className="h-full w-full"
          />
        </Suspense>
      )}

      {apparition >= 3 && top.length >= 3 && !reveal.reduced && (
        <div className="pointer-events-none absolute min-h-dvh w-full overflow-hidden">
          <div className="spotlight"></div>
        </div>
      )}

      <section
        data-testid="podium"
        className={clsx(
          "relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-between transition-opacity",
          { "opacity-0": hasRecap && !recapDone },
        )}
      >
        <h2 className="anim-show text-center text-3xl font-bold text-[color:var(--game-fg)] md:text-4xl lg:text-[clamp(3rem,6vh,6rem)]">
          {subject}
        </h2>

        {teamStandings && teamStandings.length > 0 && (
          <TeamLeaderboard standings={teamStandings} />
        )}

        {top.length === 1 ? (
          // Single winner layout
          <SingleWinner
            player={top[0]}
            subject={subject}
            autoMode={autoMode ?? false}
            apparition={apparition}
            reveal={reveal}
          />
        ) : (
          // Traditional podium layout for 2+ players
          <>
            <div
              style={{ gridTemplateColumns: `repeat(${topThree.length}, 1fr)` }}
              className={`grid w-full max-w-200 flex-1 items-end justify-center justify-self-end overflow-x-visible overflow-y-hidden`}
            >
              {topThree[1] && (
                <motion.div
                  variants={reveal.item(RISE)}
                  initial="hidden"
                  animate={apparition >= 2 ? "visible" : "hidden"}
                  transition={reveal.spring}
                  className="z-20 flex h-[50%] w-full flex-col items-center justify-center gap-3"
                >
                  <Avatar
                    src={topThree[1].avatar}
                    name={topThree[1].username}
                    size={56}
                    className="mx-auto"
                  />
                  <p
                    className={clsx(
                      "overflow-visible text-center text-2xl font-bold whitespace-nowrap text-[color:var(--game-fg)] md:text-4xl lg:text-[clamp(2rem,4vh,5rem)]",
                      {
                        "anim-balanced": apparition >= 4,
                      },
                    )}
                  >
                    {topThree[1].username}
                  </p>
                  <div className="flex h-full w-full flex-col items-center gap-4 rounded-t-xl bg-[var(--color-accent)] pt-6 text-center shadow-2xl">
                    <motion.div
                      variants={reveal.pop()}
                      initial="hidden"
                      animate={apparition >= 2 ? "visible" : "hidden"}
                      transition={reveal.snap}
                    >
                      <Medal rank={2} />
                    </motion.div>
                    <div className="flex flex-col items-center">
                      <p className="text-sm font-semibold text-white/90">
                        {t("game:podium.points")}
                      </p>
                      <p className="text-3xl font-bold text-white tabular-nums drop-shadow-sm md:text-4xl lg:text-[clamp(2rem,5vh,6rem)]">
                        {topThree[1].points}
                      </p>
                    </div>
                    <PodiumMedals achievements={topThree[1].achievements} autoMode={autoMode} isRevealed={apparition >= 2} />
                    {apparition >= 4 && (
                      <PodiumStickerButton
                        rank={rankOf[1]}
                        name={topThree[1].username}
                        points={topThree[1].points}
                        subject={subject}
                        achievements={topThree[1].achievements}
                      />
                    )}
                  </div>
                </motion.div>
              )}

              <motion.div
                variants={reveal.item(RISE)}
                initial="hidden"
                animate={apparition >= 3 ? "visible" : "hidden"}
                transition={reveal.spring}
                className={clsx(
                  "z-30 flex h-[60%] w-full flex-col items-center gap-3",
                  {
                    "md:min-w-64": topThree.length < 2,
                  },
                )}
              >
                <Avatar
                  src={topThree[0].avatar}
                  name={topThree[0].username}
                  size={72}
                  className="mx-auto"
                />
                <p
                  className={clsx(
                    "overflow-visible text-center text-2xl font-bold whitespace-nowrap text-[color:var(--game-fg)] opacity-0 md:text-4xl lg:text-[clamp(2rem,4vh,5rem)]",
                    { "anim-balanced opacity-100": apparition >= 4 },
                  )}
                >
                  {topThree[0].username}
                </p>
                <div className="flex h-full w-full flex-col items-center gap-4 rounded-t-xl bg-[var(--color-accent)] pt-6 text-center shadow-2xl">
                  <motion.div
                    variants={reveal.pop()}
                    initial="hidden"
                    animate={apparition >= 3 ? "visible" : "hidden"}
                    transition={reveal.snap}
                  >
                    <Medal rank={1} />
                  </motion.div>
                  <div className="flex flex-col items-center">
                    <p className="text-sm font-semibold text-white/90">
                      {t("game:podium.points")}
                    </p>
                    <p className="text-3xl font-bold text-white tabular-nums drop-shadow-sm md:text-4xl lg:text-[clamp(2rem,5vh,6rem)]">
                      {topThree[0].points}
                    </p>
                  </div>
                  <PodiumMedals achievements={topThree[0].achievements} autoMode={autoMode} isRevealed={apparition >= 3} />
                  {apparition >= 4 && (
                    <PodiumStickerButton
                      rank={rankOf[0]}
                      name={topThree[0].username}
                      points={topThree[0].points}
                      subject={subject}
                      achievements={topThree[0].achievements}
                    />
                  )}
                </div>
              </motion.div>

              {topThree[2] && (
                <motion.div
                  variants={reveal.item(RISE)}
                  initial="hidden"
                  animate={apparition >= 1 ? "visible" : "hidden"}
                  transition={reveal.spring}
                  className="z-10 flex h-[40%] w-full flex-col items-center gap-3"
                >
                  <Avatar
                    src={topThree[2].avatar}
                    name={topThree[2].username}
                    size={56}
                    className="mx-auto"
                  />
                  <p
                    className={clsx(
                      "overflow-visible text-center text-2xl font-bold whitespace-nowrap text-[color:var(--game-fg)] md:text-4xl lg:text-[clamp(2rem,4vh,5rem)]",
                      {
                        "anim-balanced": apparition >= 4,
                      },
                    )}
                  >
                    {topThree[2].username}
                  </p>
                  <div className="flex h-full w-full flex-col items-center gap-4 rounded-t-xl bg-[var(--color-accent)] pt-6 text-center shadow-2xl">
                    <motion.div
                      variants={reveal.pop()}
                      initial="hidden"
                      animate={apparition >= 1 ? "visible" : "hidden"}
                      transition={reveal.snap}
                    >
                      <Medal rank={3} />
                    </motion.div>

                    <div className="flex flex-col items-center">
                      <p className="text-sm font-semibold text-white/90">
                        {t("game:podium.points")}
                      </p>
                      <p className="text-3xl font-bold text-white tabular-nums drop-shadow-sm md:text-4xl lg:text-[clamp(2rem,5vh,6rem)]">
                        {topThree[2].points}
                      </p>
                    </div>
                    <PodiumMedals achievements={topThree[2].achievements} autoMode={autoMode} isRevealed={apparition >= 1} />
                    {apparition >= 4 && (
                      <PodiumStickerButton
                        rank={rankOf[2]}
                        name={topThree[2].username}
                        points={topThree[2].points}
                        subject={subject}
                        achievements={topThree[2].achievements}
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {showRankingList && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={apparition >= 4 ? { opacity: 1 } : { opacity: 0 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="w-full mt-6 px-4"
              >
                <h3 className="text-center text-lg font-semibold text-[color:var(--game-fg)] mb-4">
                  {t("game:podium.ranking")}
                </h3>
                <div className="space-y-2 max-w-md mx-auto">
                  {rankingList.map((player, idx) => (
                    <div
                      key={player.username}
                      className="flex items-center gap-3 px-4 py-2 rounded-lg bg-[color:var(--color-accent)]/10 border border-[color:var(--color-accent)]/30"
                    >
                      <span className="font-semibold text-[color:var(--color-accent)] min-w-8">
                        #{idx + 4}
                      </span>
                      <Avatar
                        src={player.avatar}
                        name={player.username}
                        size={32}
                      />
                      <span className="flex-1 font-medium text-[color:var(--game-fg)]">
                        {player.username}
                      </span>
                      <span className="text-sm font-semibold text-[color:var(--game-fg)]">
                        {player.points}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}
      </section>
    </>
  )
}

export default Podium
