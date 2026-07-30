import * as RadixAlertDialog from "@radix-ui/react-alert-dialog"
import { EVENTS } from "@razzoozle/common/constants"
import Button from "@razzoozle/web/components/Button"
import CircularTimer from "@razzoozle/web/features/game/components/CircularTimer"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useLowLatencyStore } from "@razzoozle/web/features/game/stores/lowLatency"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { monoNow } from "@razzoozle/web/features/game/utils/monoNow"
import clsx from "clsx"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  parsePowerupOptions,
  POWERUP_ICONS,
  type FlowerPowerupVoteProps,
  type PowerupType,
} from "./flower-battle.types"

// PENDING(WP-931/942): the SUBMIT_POWERUP_VOTE server handler is live
// (rust/server/src/socket/player/powerup_vote.rs, verified as of WP-942 —
// see the WP-942 report), but the S2C POWERUP_OFFERED/POWERUP_SELECTED
// broadcasts that would drive this UI from a real game are still unemitted
// anywhere in rust/server/src (grep-verified). Flip this once that broadcast
// lands and the full round-trip is proven end-to-end; until then the emit
// below is a documented no-op so this UI ships without depending on
// unfinished server wiring.
const POWERUP_VOTE_HANDLER_LIVE = false

// Reconstructs the remaining ms to `expiresAt` on the server clock, using the
// same monoNow() + clockOffsetMs anchor as Answers.tsx's low-latency
// countdown (packages/web/.../states/Answers.tsx).
const remainingSecondsUntil = (expiresAt: number, offsetMs: number): number => {
  const serverNowEstimate = monoNow() + (offsetMs || 0)
  const remainingMs = expiresAt - serverNowEstimate
  return Number.isFinite(remainingMs) ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0
}

export interface FlowerPowerupVoteCardsProps {
  options: PowerupType[]
  selected: PowerupType | null
  cardsDisabled: boolean
  locked: boolean
  statusMessage: string
  cooldownSec: number
  totalSec: number
  onSelect: (_id: PowerupType) => void
  onSubmit: () => void
}

/**
 * FlowerPowerupVoteCards — the actual vote UI (title, countdown, aria-live
 * status region, the 3-card radiogroup, submit button).
 *
 * Split out from {@link FlowerPowerupVote} as a plain, Portal-free
 * presentational component so it can be exercised directly with
 * `renderToStaticMarkup`: Radix's `Portal` only materialises its children
 * once mounted (`useLayoutEffect`, which never runs during a static server
 * render — @radix-ui/react-portal's `Portal` renders `null` until then), so
 * content living inside `RadixAlertDialog.Portal` is structurally
 * unreachable from a static-markup test regardless of vitest environment.
 * This component carries no Portal, so its markup renders every time.
 *
 * Title/description are plain `<h2>`/`<p>` (not `RadixAlertDialog.Title` /
 * `.Description`) precisely so Cards has zero Radix context dependency and
 * can render standalone in a test — `RadixAlertDialog.Title` throws
 * ("must be used within Dialog") outside a mounted Root/Content tree. The
 * ids below are wired to `RadixAlertDialog.Content`'s
 * `aria-labelledby`/`aria-describedby` in {@link FlowerPowerupVote}, which is
 * standard, valid ARIA labelling independent of Radix's own Title/Description
 * primitives.
 */
const TITLE_ID = "flower-powerup-vote-title"
const DESCRIPTION_ID = "flower-powerup-vote-description"

export function FlowerPowerupVoteCards({
  options,
  selected,
  cardsDisabled,
  locked,
  statusMessage,
  cooldownSec,
  totalSec,
  onSelect,
  onSubmit,
}: FlowerPowerupVoteCardsProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 id={TITLE_ID} className="text-lg font-bold text-[color:var(--game-fg)]">
          {t("game:flowerBattle.powerupVote.title")}
        </h2>
        <CircularTimer seconds={cooldownSec} total={totalSec || 1} size={48} />
      </div>

      <p id={DESCRIPTION_ID} className="mt-1 text-sm text-[color:var(--game-fg)]/70">
        {t("game:flowerBattle.powerupVote.description")}
      </p>

      {/* A11y: announces selection/submit/lock transitions for screen readers. */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      <div
        role="radiogroup"
        aria-label={t("game:flowerBattle.powerupVote.title")}
        className="mt-4 grid grid-cols-1 gap-3"
      >
        {options.map((id) => {
          const Icon = POWERUP_ICONS[id]
          const isSelected = selected === id

          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={cardsDisabled}
              data-testid={`powerup-option-${id}`}
              onClick={() => onSelect(id)}
              className={clsx(
                "flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isSelected
                  ? "border-transparent bg-accent-tint text-accent-contrast"
                  : "border-[var(--border-hairline)] bg-transparent text-[color:var(--game-fg)] hover:bg-black/5",
              )}
            >
              <Icon aria-hidden="true" className="size-7 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {t(`game:flowerBattle.powerupVote.options.${id}.name`)}
                </span>
                <span className="block text-sm opacity-80">
                  {t(`game:flowerBattle.powerupVote.options.${id}.effect`)}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <Button
        variant="primary"
        className="mt-4 w-full"
        disabled={!selected || cardsDisabled}
        onClick={onSubmit}
      >
        {locked
          ? t("game:flowerBattle.powerupVote.status.submitted")
          : t("game:flowerBattle.powerupVote.submit")}
      </Button>

      {/* Reconnect note: a resumed player's vote is whatever the server
          snapshot says was recorded — this component never restores a
          choice from any client-side cache. */}
    </>
  )
}

/**
 * FlowerPowerupVote — player-facing power-up selection modal (WP-FLB-16).
 *
 * Renders exactly 3 cards parsed from the offer's comma-joined `offerType`
 * wire field (never an array — see rust/protocol/bindings/PowerupOffer.ts).
 * A single tap selects a card; submitting locks every card so a second tap
 * can't re-fire the vote. After `expiresAt` the cards lock without submitting.
 *
 * Structural reference: components/AlertDialog.tsx (controlled Radix
 * AlertDialog) — but this dialog has no Cancel/dismiss action; the vote is
 * mandatory while an offer is open, so `onOpenChange` is a deliberate no-op
 * (Escape is caught, not honoured) rather than the bubbling-prone
 * open/close pattern documented as a gotcha for portal-based dialogs.
 */
export function FlowerPowerupVote({ mode, offer }: FlowerPowerupVoteProps) {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const { gameId } = usePlayerStore()
  const clockOffsetMs = useLowLatencyStore((s) => s.offsetMs)
  const clockOffsetRef = useRef(clockOffsetMs)

  useEffect(() => {
    clockOffsetRef.current = clockOffsetMs
  }, [clockOffsetMs])

  const [selected, setSelected] = useState<PowerupType | null>(null)
  const [locked, setLocked] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [cooldownSec, setCooldownSec] = useState(() =>
    offer ? remainingSecondsUntil(offer.expiresAt, clockOffsetMs) : 0,
  )
  const [totalSec, setTotalSec] = useState(cooldownSec)
  // Guards the "exactly once" requirement even if the disabled button is
  // somehow activated twice in the same tick (e.g. fast double-tap).
  const votedOfferIdRef = useRef<string | null>(null)

  const options: PowerupType[] = offer ? parsePowerupOptions(offer.offerType) : []

  const isFlowerBattle = mode === "flowerBattle"
  const hasOffer = !!offer && options.length === 3
  const isOpen = isFlowerBattle && hasOffer

  // New offer opened: reset the vote UI and re-anchor the countdown ring.
  useEffect(() => {
    if (!offer) return

    setSelected(null)
    setLocked(false)
    setStatusMessage("")
    votedOfferIdRef.current = null

    const initial = remainingSecondsUntil(offer.expiresAt, clockOffsetRef.current)
    setCooldownSec(initial)
    setTotalSec(initial)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only a new offer.id re-anchors; a clock resync mid-vote must not reset the ring.
  }, [offer?.id])

  // Server-authoritative countdown to expiresAt (Answers.tsx-Muster). Locks
  // the cards once time runs out — no late emit is possible after this.
  useEffect(() => {
    if (!offer) return

    const tick = () => {
      const remaining = remainingSecondsUntil(offer.expiresAt, clockOffsetRef.current)
      setCooldownSec(remaining)
      if (remaining <= 0) {
        setLocked(true)
      }
    }

    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- offer's own id+expiresAt are the only fields read; the full object churns every render.
  }, [offer?.id, offer?.expiresAt])

  if (!isOpen || !offer) {
    return null
  }

  const expired = cooldownSec <= 0
  const cardsDisabled = locked || expired

  const handleSelect = (id: PowerupType) => {
    if (cardsDisabled) return
    setSelected(id)
    setStatusMessage(
      t("game:flowerBattle.powerupVote.status.selected", {
        name: t(`game:flowerBattle.powerupVote.options.${id}.name`),
      }),
    )
  }

  const handleSubmit = () => {
    if (!selected || cardsDisabled || !gameId) return
    if (votedOfferIdRef.current === offer.id) return

    votedOfferIdRef.current = offer.id
    setLocked(true)
    setStatusMessage(t("game:flowerBattle.powerupVote.status.submitted"))

    if (POWERUP_VOTE_HANDLER_LIVE) {
      // Wire-verified payload shape: PowerupVotePayload in
      // rust/server/src/socket/player/powerup_vote.rs — flat { gameId,
      // optionIndex }, index into `options`, not the PowerupType string.
      socket.emit(EVENTS.FLOWER_BATTLE.SUBMIT_POWERUP_VOTE, {
        gameId,
        optionIndex: options.indexOf(selected),
      })
    }
  }

  return (
    <RadixAlertDialog.Root open={isOpen} onOpenChange={() => {}}>
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/40" />

        <RadixAlertDialog.Content
          data-testid="flower-powerup-vote"
          aria-labelledby={TITLE_ID}
          aria-describedby={DESCRIPTION_ID}
          className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5 shadow-[var(--shadow-flat)]"
        >
          <FlowerPowerupVoteCards
            options={options}
            selected={selected}
            cardsDisabled={cardsDisabled}
            locked={locked}
            statusMessage={statusMessage}
            cooldownSec={cooldownSec}
            totalSec={totalSec}
            onSelect={handleSelect}
            onSubmit={handleSubmit}
          />
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  )
}

export default FlowerPowerupVote
