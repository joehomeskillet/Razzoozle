import { EVENTS } from "@razzoozle/common/constants"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useLowLatencyStore } from "@razzoozle/web/features/game/stores/lowLatency"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { monoNow } from "@razzoozle/web/features/game/utils/monoNow"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  filterVoteCandidates,
  TARGET_VOTE_WINDOW_MS,
  type FlowerTeamView,
  type TargetTeamVoteProps,
} from "../flower-battle.types"

// PENDING(WP-932/933): the SUBMIT_POWERUP_TARGET_VOTE server handler is live
// (rust/server/src/socket/player/powerup_vote.rs, verified as of WP-942 —
// see the WP-942 report), but the S2C POWERUP_SELECTED broadcast that would
// drive this UI from a real game is still unemitted anywhere in
// rust/server/src (grep-verified). Flip this once that broadcast lands and
// the full round-trip is proven end-to-end; until then the emit below is a
// documented no-op so this UI ships without depending on unfinished server
// wiring.
const TARGET_VOTE_HANDLER_LIVE = false

// Reconstructs the remaining ms to an absolute server-clock deadline, using
// the same monoNow() + clockOffsetMs anchor as WP #941's FlowerPowerupVote
// (packages/web/.../player/FlowerPowerupVote.tsx) and Answers.tsx.
const remainingSecondsUntil = (expiresAt: number, offsetMs: number): number => {
  const serverNowEstimate = monoNow() + (offsetMs || 0)
  const remainingMs = expiresAt - serverNowEstimate
  return Number.isFinite(remainingMs) ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0
}

export interface UseTargetTeamVoteResult {
  /** True only for FlowerBattle mode + an active acid_rain selection. */
  isOpen: boolean
  /** All teams except the voter's own. */
  candidates: FlowerTeamView[]
  selectedTeam: string | null
  locked: boolean
  cooldownSec: number
  totalSec: number
  statusMessage: string
  /** Umbrella-shielded — visibly marked but still selectable. */
  isTeamShielded: (_team: FlowerTeamView) => boolean
  /** Blocked by the anti-repeat rule specifically (independent of the vote-window lock), so the UI can show its own reason text. */
  isTeamAntiRepeat: (_team: FlowerTeamView) => boolean
  /** Locked/expired OR blocked by anti-repeat. */
  isTeamDisabled: (_team: FlowerTeamView) => boolean
  selectTeam: (_teamName: string) => void
  submit: () => void
}

/**
 * useTargetTeamVote — all state/timing/socket logic for {@link TargetTeamVote}
 * (WP #942), so the component itself stays a thin render layer under 400 LOC.
 *
 * Mirrors WP #941's FlowerPowerupVote countdown/exactly-once-submit pattern,
 * but the 5s deadline is DERIVED (`selectedAtServerMs + TARGET_VOTE_WINDOW_MS`)
 * rather than server-carried, since FLOWER_BATTLE.POWERUP_SELECTED has no
 * typed wire contract yet.
 */
export function useTargetTeamVote({
  mode,
  selection,
  teams,
  ownTeamName,
}: TargetTeamVoteProps): UseTargetTeamVoteResult {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const { gameId } = usePlayerStore()
  const clockOffsetMs = useLowLatencyStore((s) => s.offsetMs)
  const clockOffsetRef = useRef(clockOffsetMs)

  useEffect(() => {
    clockOffsetRef.current = clockOffsetMs
  }, [clockOffsetMs])

  const isOpen =
    mode === "flowerBattle" && !!selection && selection.optionId === "acid_rain"

  const candidates = filterVoteCandidates(teams, ownTeamName)

  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [cooldownSec, setCooldownSec] = useState(() =>
    selection
      ? remainingSecondsUntil(
          selection.selectedAtServerMs + TARGET_VOTE_WINDOW_MS,
          clockOffsetMs,
        )
      : 0,
  )
  const [totalSec, setTotalSec] = useState(cooldownSec)
  // Guards the "exactly once" requirement even if the disabled button is
  // somehow activated twice in the same tick (e.g. fast double-tap).
  const votedOfferIdRef = useRef<string | null>(null)

  // New selection opened: reset the vote UI and re-anchor the countdown ring.
  useEffect(() => {
    if (!selection) return

    setSelectedTeam(null)
    setLocked(false)
    setStatusMessage("")
    votedOfferIdRef.current = null

    const deadline = selection.selectedAtServerMs + TARGET_VOTE_WINDOW_MS
    const initial = remainingSecondsUntil(deadline, clockOffsetRef.current)
    setCooldownSec(initial)
    setTotalSec(initial)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only a new offerId re-anchors; a clock resync mid-vote must not reset the ring.
  }, [selection?.offerId])

  // Server-authoritative countdown to the derived deadline. Locks the chips
  // once time runs out — no late emit is possible after this.
  useEffect(() => {
    if (!selection) return

    const deadline = selection.selectedAtServerMs + TARGET_VOTE_WINDOW_MS
    const tick = () => {
      const remaining = remainingSecondsUntil(deadline, clockOffsetRef.current)
      setCooldownSec(remaining)
      if (remaining <= 0) {
        setLocked(true)
      }
    }

    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- selection's own offerId+selectedAtServerMs are the only fields read; the full object churns every render.
  }, [selection?.offerId, selection?.selectedAtServerMs])

  const expired = cooldownSec <= 0
  const chipsDisabled = locked || expired

  const isTeamShielded = (team: FlowerTeamView): boolean =>
    team.effects.includes("umbrella_shield")

  // Anti-repeat: this candidate was hit by the voter's own team last time —
  // blocked from being hit again back-to-back (rust/protocol FlowerBattleTeamState
  // .previousAttackerTeamId, WP #931 domain rule). Exposed separately from
  // isTeamDisabled so the UI can show the reason text specifically for this
  // cause, not for a generic locked/expired chip.
  const isTeamAntiRepeat = (team: FlowerTeamView): boolean =>
    team.previousAttackerTeamId === ownTeamName

  const isTeamDisabled = (team: FlowerTeamView): boolean =>
    chipsDisabled || isTeamAntiRepeat(team)

  const selectTeam = (teamName: string) => {
    const team = candidates.find((candidate) => candidate.name === teamName)
    if (!team || isTeamDisabled(team)) return

    setSelectedTeam(teamName)
    setStatusMessage(
      t("game:flowerBattle.targetVote.status.selected", {
        name: t(`game:teams.${teamName}`, { defaultValue: teamName }),
      }),
    )
  }

  const submit = () => {
    if (!selectedTeam || chipsDisabled || !selection || !gameId) return
    if (votedOfferIdRef.current === selection.offerId) return

    votedOfferIdRef.current = selection.offerId
    setLocked(true)
    setStatusMessage(t("game:flowerBattle.targetVote.status.submitted"))

    if (TARGET_VOTE_HANDLER_LIVE) {
      // Wire-verified payload shape: TargetVotePayload in
      // rust/server/src/socket/player/powerup_vote.rs — flat { gameId,
      // targetTeamId }, no offerId/clientMessageId (the handler doesn't read
      // them; it re-derives the attacker team from the socket's own player).
      socket.emit(EVENTS.FLOWER_BATTLE.SUBMIT_POWERUP_TARGET_VOTE, {
        gameId,
        targetTeamId: selectedTeam,
      })
    }
  }

  return {
    isOpen,
    candidates,
    selectedTeam,
    locked,
    cooldownSec,
    totalSec,
    statusMessage,
    isTeamShielded,
    isTeamAntiRepeat,
    isTeamDisabled,
    selectTeam,
    submit,
  }
}
