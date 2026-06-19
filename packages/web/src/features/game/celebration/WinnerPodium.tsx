/**
 * WinnerPodium — brand-neutral, reusable cream podium for the celebration layer.
 *
 * Extracted from the host screen's existing podium (states/Podium.tsx) so any
 * surface can render a 1st/2nd/3rd stage with the same cream visual language.
 * Desktop: 1st center, 2nd left, 3rd right (center tallest). Mobile: stacked.
 *
 * Pure presentation — no socket/store/network. Motion goes through useReveal()
 * (variants only, no `layout`, so it stays safe on player-scaled lists).
 */

import Avatar from "@razzoozle/web/components/Avatar"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import AchievementMedal from "@razzoozle/web/features/game/components/AchievementMedal"
import { ACHIEVEMENT_META } from "@razzoozle/web/features/game/utils/achievements"
import clsx from "clsx"
import { motion } from "motion/react"
import type { Celebrant, WinnerPodiumProps } from "./types"

// Lifecycle rise distance — blocks lift up from below as each tier reveals.
// Opacity-only when reduced (reveal.item handles the guard).
const RISE = 96

// Rank → tier-fill token for the brand-neutral medal circle.
const MEDAL_FILL: Record<1 | 2 | 3, string> = {
  1: "bg-[var(--tier-gold)]",
  2: "bg-[var(--tier-silver)]",
  3: "bg-[var(--tier-bronze)]",
}

// ─── Achievement medal row (per podium block) ─────────────────────────────────
// Renders up to 3 of the celebrant's full-game badges. Skips ids absent from the
// static meta catalog (noUncheckedIndexedAccess: meta is AchievementMeta|undefined).

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

// ─── Single podium block ──────────────────────────────────────────────────────

interface BlockProps {
  celebrant: Celebrant
  rank: 1 | 2 | 3
  active: boolean
  /** Tailwind height + z-index classes that convey rank (1st tallest). */
  shape: string
}

const PodiumBlock = ({ celebrant, rank, active, shape }: BlockProps) => {
  const reveal = useReveal()
  const avatarSize = rank === 1 ? 72 : 56

  return (
    <motion.div
      variants={reveal.item(RISE)}
      initial="hidden"
      animate={active ? "visible" : "hidden"}
      transition={reveal.spring}
      className={clsx(
        "flex w-full flex-col items-center gap-3",
        shape,
      )}
    >
      <Avatar
        src={celebrant.avatar}
        name={celebrant.name}
        size={avatarSize}
        className="mx-auto"
      />
      <p className="overflow-visible text-center text-2xl font-bold whitespace-nowrap text-[color:var(--game-fg)] md:text-4xl lg:text-[clamp(2rem,4vh,5rem)]">
        {celebrant.name}
      </p>
      <div className="glass-2 flex h-full w-full flex-col items-center gap-4 rounded-t-xl bg-[var(--color-accent)] pt-6 text-center shadow-2xl">
        <motion.div
          variants={reveal.pop()}
          initial="hidden"
          animate={active ? "visible" : "hidden"}
          transition={reveal.snap}
          className={clsx(
            "flex aspect-square size-16 items-center justify-center rounded-full text-3xl font-extrabold text-[#0E1120] md:size-20 md:text-4xl",
            MEDAL_FILL[rank],
          )}
        >
          {rank}
        </motion.div>
        <p className="text-3xl font-bold text-white tabular-nums drop-shadow-sm md:text-4xl lg:text-[clamp(2rem,5vh,6rem)]">
          {celebrant.points}
        </p>
        <PodiumMedals achievements={celebrant.achievements} />
      </div>
    </motion.div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

const WinnerPodium = ({ top, active = true }: WinnerPodiumProps) => {
  const first: Celebrant | undefined = top[0]
  const second: Celebrant | undefined = top[1]
  const third: Celebrant | undefined = top[2]

  // Nothing to celebrate.
  if (!first) return null

  return (
    <section className="mx-auto flex w-full max-w-200 flex-1 flex-col items-stretch justify-center gap-4 overflow-x-visible overflow-y-hidden md:flex-row md:items-end md:justify-center md:gap-0">
      {/* 2nd — desktop left, mobile second. */}
      {second && (
        <PodiumBlock
          celebrant={second}
          rank={2}
          active={active}
          shape="z-20 order-2 md:order-1 md:h-[50%]"
        />
      )}

      {/* 1st — desktop center & tallest, mobile first. */}
      <PodiumBlock
        celebrant={first}
        rank={1}
        active={active}
        shape="z-30 order-1 md:order-2 md:h-[60%]"
      />

      {/* 3rd — desktop right, mobile last. */}
      {third && (
        <PodiumBlock
          celebrant={third}
          rank={3}
          active={active}
          shape="z-10 order-3 md:order-3 md:h-[40%]"
        />
      )}
    </section>
  )
}

export default WinnerPodium
