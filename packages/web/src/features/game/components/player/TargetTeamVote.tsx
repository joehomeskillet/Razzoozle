import * as RadixAlertDialog from "@radix-ui/react-alert-dialog"
import Button from "@razzoozle/web/components/Button"
import CircularTimer from "@razzoozle/web/features/game/components/CircularTimer"
import { teamSwatch, type Team } from "@razzoozle/web/features/game/utils/teams"
import clsx from "clsx"
import { Umbrella } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { FlowerTeamView, TargetTeamVoteProps } from "./flower-battle.types"
import { useTargetTeamVote } from "./hooks/useTargetTeamVote"

const TITLE_ID = "target-team-vote-title"
const DESCRIPTION_ID = "target-team-vote-description"

export interface TargetTeamChipsProps {
  candidates: FlowerTeamView[]
  selectedTeam: string | null
  statusMessage: string
  cooldownSec: number
  totalSec: number
  isTeamShielded: (_team: FlowerTeamView) => boolean
  isTeamAntiRepeat: (_team: FlowerTeamView) => boolean
  isTeamDisabled: (_team: FlowerTeamView) => boolean
  onSelect: (_teamName: string) => void
  onSubmit: () => void
}

/**
 * TargetTeamChips — the actual vote UI (title, countdown, aria-live status
 * region, the team-chip radiogroup, submit button).
 *
 * Split out from {@link TargetTeamVote} as a plain, Portal-free presentational
 * component so it can be exercised directly with `renderToStaticMarkup` — see
 * FlowerPowerupVoteCards (WP-941, FlowerPowerupVote.tsx) for the full
 * rationale: Radix's `Portal` only materialises its children once mounted
 * (`useLayoutEffect`, which never runs during a static server render), so
 * content living inside `RadixAlertDialog.Portal` is structurally
 * unreachable from a static-markup test regardless of vitest environment.
 *
 * Title/description are plain `<h2>`/`<p>` (not `RadixAlertDialog.Title` /
 * `.Description`) for the same reason as WP-941: those throw ("must be used
 * within Dialog") outside a mounted Root/Content tree. Wired to
 * `RadixAlertDialog.Content`'s `aria-labelledby`/`aria-describedby` in
 * {@link TargetTeamVote} — standard, valid ARIA labelling either way.
 */
export function TargetTeamChips({
  candidates,
  selectedTeam,
  statusMessage,
  cooldownSec,
  totalSec,
  isTeamShielded,
  isTeamAntiRepeat,
  isTeamDisabled,
  onSelect,
  onSubmit,
}: TargetTeamChipsProps) {
  const { t } = useTranslation()
  const selectedTeamData = candidates.find((team) => team.name === selectedTeam)

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 id={TITLE_ID} className="text-lg font-bold text-[color:var(--game-fg)]">
          {t("game:flowerBattle.targetVote.title")}
        </h2>
        <CircularTimer seconds={cooldownSec} total={totalSec || 1} size={48} />
      </div>

      <p id={DESCRIPTION_ID} className="mt-1 text-sm text-[color:var(--game-fg)]/70">
        {t("game:flowerBattle.targetVote.description")}
      </p>

      {/* A11y: announces selection/submit/lock transitions for screen readers. */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      <div
        role="radiogroup"
        aria-label={t("game:flowerBattle.targetVote.title")}
        className="mt-4 grid grid-cols-1 gap-3"
      >
        {candidates.map((team) => {
          const isSelected = selectedTeam === team.name
          const shielded = isTeamShielded(team)
          const antiRepeat = isTeamAntiRepeat(team)
          const disabled = isTeamDisabled(team)
          const swatch = teamSwatch(team.name as Team)

          return (
            <div key={team.name} className="flex flex-col gap-1">
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={disabled}
                data-testid={`target-team-${team.name}`}
                onClick={() => onSelect(team.name)}
                className={clsx(
                  "flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  isSelected
                    ? "border-transparent bg-accent-tint text-accent-contrast"
                    : clsx("ring-2 ring-inset", swatch.bg, swatch.ring, swatch.label),
                )}
              >
                <span className="font-semibold">{t(`game:teams.${team.name}`)}</span>
                {shielded && (
                  <span
                    data-testid={`target-team-${team.name}-shield`}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent-contrast"
                  >
                    <Umbrella aria-hidden="true" className="size-3.5" />
                    {t("game:flowerBattle.targetVote.shieldBadge")}
                  </span>
                )}
              </button>
              {antiRepeat && (
                <p
                  data-testid={`target-team-${team.name}-reason`}
                  className="px-1 text-xs text-[color:var(--game-fg)]/60"
                >
                  {t("game:flowerBattle.targetVote.disabledReason.recentlyAttacked")}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <Button
        variant="primary"
        className="mt-4 w-full"
        disabled={
          !selectedTeam ||
          !selectedTeamData ||
          isTeamDisabled(selectedTeamData)
        }
        onClick={onSubmit}
      >
        {statusMessage === t("game:flowerBattle.targetVote.status.submitted")
          ? t("game:flowerBattle.targetVote.status.submitted")
          : t("game:flowerBattle.targetVote.submit")}
      </Button>
    </>
  )
}

/**
 * TargetTeamVote — player-facing target-team selection modal (WP-FLB-17).
 *
 * Opens only after a FLOWER_BATTLE.POWERUP_SELECTED broadcast resolves to the
 * "acid_rain" power-up (Props-getrieben, same pattern as WP-941's
 * FlowerPowerupVote: the caller builds `selection` from whatever it has,
 * since neither the broadcast's wire contract nor the
 * SUBMIT_POWERUP_TARGET_VOTE handler are live yet). Shows every active team
 * except the voter's own; an umbrella-shielded team stays selectable (marked
 * only), while the team that last attacked the voter's own team is disabled
 * with a visible reason (anti-repeat).
 *
 * All state/timing/socket logic lives in {@link useTargetTeamVote} — this
 * component is purely the Radix AlertDialog shell + wiring.
 */
export function TargetTeamVote(props: TargetTeamVoteProps) {
  const {
    isOpen,
    candidates,
    selectedTeam,
    statusMessage,
    cooldownSec,
    totalSec,
    isTeamShielded,
    isTeamAntiRepeat,
    isTeamDisabled,
    selectTeam,
    submit,
  } = useTargetTeamVote(props)

  if (!isOpen) {
    return null
  }

  return (
    <RadixAlertDialog.Root open={isOpen} onOpenChange={() => {}}>
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/40" />

        <RadixAlertDialog.Content
          data-testid="target-team-vote"
          aria-labelledby={TITLE_ID}
          aria-describedby={DESCRIPTION_ID}
          className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5 shadow-[var(--shadow-flat)]"
        >
          <TargetTeamChips
            candidates={candidates}
            selectedTeam={selectedTeam}
            statusMessage={statusMessage}
            cooldownSec={cooldownSec}
            totalSec={totalSec}
            isTeamShielded={isTeamShielded}
            isTeamAntiRepeat={isTeamAntiRepeat}
            isTeamDisabled={isTeamDisabled}
            onSelect={selectTeam}
            onSubmit={submit}
          />
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  )
}

export default TargetTeamVote
