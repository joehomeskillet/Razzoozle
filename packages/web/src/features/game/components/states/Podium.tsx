import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Avatar from "@razzoozle/web/components/Avatar"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import TeamLeaderboard from "@razzoozle/web/features/game/components/TeamLeaderboard"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { SFX } from "@razzoozle/web/features/game/utils/constants"
import useScreenSize from "@razzoozle/web/hooks/useScreenSize"
import clsx from "clsx"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import ReactConfetti from "react-confetti"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["FINISHED"]
}

const usePodiumAnimation = (topLength: number) => {
  const [apparition, setApparition] = useState(0)
  const muted = useSoundStore((s) => s.muted)

  const [sfxtThree] = useSound(SFX.PODIUM.THREE, {
    volume: 0.1,
    soundEnabled: !muted,
  })
  const [sfxSecond] = useSound(SFX.PODIUM.SECOND, {
    volume: 0.1,
    soundEnabled: !muted,
  })
  const [sfxRool, { stop: sfxRoolStop }] = useSound(SFX.PODIUM.SNEAR_ROOL, {
    volume: 0.1,
    soundEnabled: !muted,
  })
  const [sfxFirst] = useSound(SFX.PODIUM.FIRST, {
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
  }, [apparition, topLength])

  return apparition
}

const medalColor = [
  {
    background: "bg-yellow-500",
    border: "border-yellow-600",
  },
  {
    background: "bg-gray-400",
    border: "border-gray-200",
  },
  {
    background: "bg-amber-700",
    border: "border-amber-800",
  },
]

const Medal = ({ rank }: { rank: number }) => {
  const color = medalColor[rank - 1]

  return (
    <div
      className={clsx(
        "relative flex aspect-square size-20 items-center justify-center overflow-hidden rounded-full border-8 text-5xl font-extrabold text-white drop-shadow-sm md:size-26 md:border-10 md:text-6xl",
        color.background,
        color.border,
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <div className="absolute top-[30%] left-1/2 h-6 w-[160%] -translate-x-1/2 -rotate-40 bg-white/25" />
        <div className="absolute top-[70%] left-1/2 h-3 w-[160%] -translate-x-1/2 -rotate-40 bg-white/25" />
      </div>
      <p
        className="relative z-10"
        style={{ textShadow: "2px 2px rgba(0,0,0, 0.25)" }}
      >
        {rank}
      </p>
    </div>
  )
}

const Podium = ({ data: { subject, top, teamStandings } }: Props) => {
  const apparition = usePodiumAnimation(top.length)

  const { width, height } = useScreenSize()
  const reveal = useReveal()
  // Lifecycle rise distance — the podium blocks lift up from below as each
  // tier reveals. Opacity-only when reduced (reveal.item handles the guard).
  const RISE = 96

  return (
    <>
      {apparition >= 4 && !reveal.reduced && (
        <ReactConfetti
          width={width}
          height={height}
          className="h-full w-full"
        />
      )}

      {apparition >= 3 && top.length >= 3 && !reveal.reduced && (
        <div className="pointer-events-none absolute min-h-dvh w-full overflow-hidden">
          <div className="spotlight"></div>
        </div>
      )}
      <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-between">
        <h2 className="anim-show text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(3rem,6vh,6rem)]">
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
                  "overflow-visible text-center text-2xl font-bold whitespace-nowrap text-white drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,4vh,5rem)]",
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
                "overflow-visible text-center text-2xl font-bold whitespace-nowrap text-white opacity-0 drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,4vh,5rem)]",
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
                  "overflow-visible text-center text-2xl font-bold whitespace-nowrap text-white drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,4vh,5rem)]",
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
              </div>
            </motion.div>
          )}
        </div>
      </section>
    </>
  )
}

export default Podium
