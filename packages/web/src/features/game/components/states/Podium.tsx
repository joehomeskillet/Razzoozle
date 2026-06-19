import type { ManagerRecap } from "@razzoozle/common/types/game"
import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Avatar from "@razzoozle/web/components/Avatar"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import CelebrationOverlay from "@razzoozle/web/features/game/celebration/CelebrationOverlay"
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
import { Share2 } from "lucide-react"
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
    border: "border-yellow-600",
    // gold tier → ink label (ink reads on the light-gold fill)
    text: "text-[#0E1120]",
  },
  {
    background: "bg-[var(--tier-silver)]",
    border: "border-gray-200",
    // silver tier → ink label
    text: "text-[#0E1120]",
  },
  {
    background: "bg-[var(--tier-bronze)]",
    border: "border-amber-800",
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
        <div className="absolute top-[30%] left-1/2 h-6 w-[160%] -translate-x-1/2 -rotate-40 bg-white/25" />
        <div className="absolute top-[70%] left-1/2 h-3 w-[160%] -translate-x-1/2 -rotate-40 bg-white/25" />
      </div>
      <p className="relative z-10">{rank}</p>
    </div>
  )
}

// ─── Achievement medal row (per podium block) ─────────────────────────────────
// Renders up to 3 of the player's full-game achievement badges beneath their
// podium block. Skips ids absent from the static meta catalog.

const PodiumMedals = ({ achievements }: { achievements?: string[] }) => {
  const shown = (achievements ?? [])
    .map((id) => ({ id, meta: ACHIEVEMENT_META[id] }))
    .filter((x): x is { id: string; meta: (typeof ACHIEVEMENT_META)[string] } =>
      Boolean(x.meta),
    )
    .slice(0, 3)

  if (shown.length === 0) return null

  return (
    <div className="flex items-center justify-center gap-2 pt-3">
      {shown.map(({ id, meta }) => (
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
          ? t("game:recap.sticker.shared", { defaultValue: "Geteilt" })
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
      ? t("game:recap.sticker.share", { defaultValue: "Sticker teilen" })
      : t("game:recap.sticker.create", { defaultValue: "Sticker erstellen" })

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
        <Share2 className="size-4" aria-hidden />
        {label}
      </button>
    </>
  )
}

const Podium = ({ data: { subject, top, teamStandings, recap, autoMode } }: Props) => {
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

  // Celebration overlay payload (achievement-burst only; this screen already
  // draws its own podium + react-confetti, so renderPodium/fireConfetti are
  // false below — the overlay adds ONLY the new achievement-burst queue).
  const celebration = useMemo(
    () => ({
      podium: top.map((p) => ({
        id: p.username,
        name: p.username,
        points: p.points,
        avatar: p.avatar,
        achievements: p.achievements,
      })),
      newAchievements: top[0]?.achievements ?? [],
    }),
    [top],
  )

  return (
    <>
      {/* Superlative recap reveal — overlays the podium until it completes. */}
      {hasRecap && !recapDone && (
        <RecapSequence
          superlatives={managerRecap.superlatives}
          autoMode={autoMode}
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

      {/* Celebration overlay — fires the new achievement-burst queue only, once
          the podium has fully revealed. Podium + confetti stay owned by this
          screen (renderPodium / fireConfetti false) so nothing is duplicated. */}
      {apparition >= 4 && (
        <CelebrationOverlay
          data={celebration}
          renderPodium={false}
          fireConfetti={false}
        />
      )}

      {apparition >= 3 && top.length >= 3 && !reveal.reduced && (
        <div className="pointer-events-none absolute min-h-dvh w-full overflow-hidden">
          <div className="spotlight"></div>
        </div>
      )}
      <section
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

        <div
          style={{ gridTemplateColumns: `repeat(${top.length}, 1fr)` }}
          className={`grid w-full max-w-200 flex-1 items-end justify-center justify-self-end overflow-x-visible overflow-y-hidden`}
        >
          {top[1] && (
            <motion.div
              variants={reveal.item(RISE)}
              initial="hidden"
              animate={apparition >= 2 ? "visible" : "hidden"}
              transition={reveal.spring}
              className="z-20 flex h-[50%] w-full flex-col items-center justify-center gap-3"
            >
              <Avatar
                src={top[1].avatar}
                name={top[1].username}
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
                {top[1].username}
              </p>
              <div className="glass-2 flex h-full w-full flex-col items-center gap-4 rounded-t-xl bg-[var(--color-accent)] pt-6 text-center shadow-2xl">
                <motion.div
                  variants={reveal.pop()}
                  initial="hidden"
                  animate={apparition >= 2 ? "visible" : "hidden"}
                  transition={reveal.snap}
                >
                  <Medal rank={2} />
                </motion.div>
                <p className="text-3xl font-bold text-white tabular-nums drop-shadow-sm md:text-4xl lg:text-[clamp(2rem,5vh,6rem)]">
                  {top[1].points}
                </p>
                <PodiumMedals achievements={top[1].achievements} />
                {apparition >= 4 && (
                  <PodiumStickerButton
                    rank={rankOf[1]}
                    name={top[1].username}
                    points={top[1].points}
                    subject={subject}
                    achievements={top[1].achievements}
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
                "md:min-w-64": top.length < 2,
              },
            )}
          >
            <Avatar
              src={top[0].avatar}
              name={top[0].username}
              size={72}
              className="mx-auto"
            />
            <p
              className={clsx(
                "overflow-visible text-center text-2xl font-bold whitespace-nowrap text-[color:var(--game-fg)] opacity-0 md:text-4xl lg:text-[clamp(2rem,4vh,5rem)]",
                { "anim-balanced opacity-100": apparition >= 4 },
              )}
            >
              {top[0].username}
            </p>
            <div className="glass-2 flex h-full w-full flex-col items-center gap-4 rounded-t-xl bg-[var(--color-accent)] pt-6 text-center shadow-2xl">
              <motion.div
                variants={reveal.pop()}
                initial="hidden"
                animate={apparition >= 3 ? "visible" : "hidden"}
                transition={reveal.snap}
              >
                <Medal rank={1} />
              </motion.div>
              <p className="text-3xl font-bold text-white tabular-nums drop-shadow-sm md:text-4xl lg:text-[clamp(2rem,5vh,6rem)]">
                {top[0].points}
              </p>
              <PodiumMedals achievements={top[0].achievements} />
              {apparition >= 4 && (
                <PodiumStickerButton
                  rank={rankOf[0]}
                  name={top[0].username}
                  points={top[0].points}
                  subject={subject}
                  achievements={top[0].achievements}
                />
              )}
            </div>
          </motion.div>

          {top[2] && (
            <motion.div
              variants={reveal.item(RISE)}
              initial="hidden"
              animate={apparition >= 1 ? "visible" : "hidden"}
              transition={reveal.spring}
              className="z-10 flex h-[40%] w-full flex-col items-center gap-3"
            >
              <Avatar
                src={top[2].avatar}
                name={top[2].username}
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
                {top[2].username}
              </p>
              <div className="glass-2 flex h-full w-full flex-col items-center gap-4 rounded-t-xl bg-[var(--color-accent)] pt-6 text-center shadow-2xl">
                <motion.div
                  variants={reveal.pop()}
                  initial="hidden"
                  animate={apparition >= 1 ? "visible" : "hidden"}
                  transition={reveal.snap}
                >
                  <Medal rank={3} />
                </motion.div>

                <p className="text-3xl font-bold text-white tabular-nums drop-shadow-sm md:text-4xl lg:text-[clamp(2rem,5vh,6rem)]">
                  {top[2].points}
                </p>
                <PodiumMedals achievements={top[2].achievements} />
                {apparition >= 4 && (
                  <PodiumStickerButton
                    rank={rankOf[2]}
                    name={top[2].username}
                    points={top[2].points}
                    subject={subject}
                    achievements={top[2].achievements}
                  />
                )}
              </div>
            </motion.div>
          )}
        </div>
      </section>
    </>
  )
}

export default Podium
