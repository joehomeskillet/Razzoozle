import clsx from "clsx"
import { Eye, Minus, Plus, SkipForward } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import Button from "@razzoozle/web/components/Button"
import StatusBadge, {
  type StatusType,
} from "@razzoozle/web/components/StatusBadge"
import "@razzoozle/web/features/manager/components/console/tokens.css"

export interface ManagerTeamStatus {
  id: string
  label: string
  status: StatusType
  detail?: string
}

export interface ManagerActionFooterProps {
  /** Current auto-advance state. Omit to use `defaultAutoMode` internally. */
  autoMode?: boolean
  defaultAutoMode?: boolean
  onAutoModeChange?: (enabled: boolean) => void
  onSkipQuestion?: () => void
  onRevealAnswer?: () => void
  onAddTime?: () => void
  onSubtractTime?: () => void
  /** Connected teams shown at the left edge of the shell band. */
  teams?: readonly ManagerTeamStatus[]
  /** Overall manager connection state, shown when no team list is supplied. */
  status?: StatusType
  className?: string
}

const statusLabels: Record<StatusType, string> = {
  online: "Online",
  offline: "Offline",
  pending: "Wird verbunden",
}

const statusIndicatorClasses: Record<StatusType, string> = {
  online: "bg-status-online-text",
  offline: "bg-status-offline-text",
  pending: "bg-status-pending-text",
}

/**
 * Persistent live-control band for the manager console.
 *
 * The component is intentionally presentational: the manager page owns socket
 * commands and passes callbacks, while this band owns the action order,
 * touch-target sizing, status communication, and responsive layout.
 */
export function ManagerActionFooter({
  autoMode,
  defaultAutoMode = false,
  onAutoModeChange,
  onSkipQuestion,
  onRevealAnswer,
  onAddTime,
  onSubtractTime,
  teams = [],
  status = "online",
  className,
}: ManagerActionFooterProps) {
  const { t } = useTranslation()
  const [internalAutoMode, setInternalAutoMode] = useState(defaultAutoMode)
  const isAutoMode = autoMode ?? internalAutoMode

  const labels = {
    autoMode: t("game:controls.autoMode", { defaultValue: "Auto-Modus" }),
    autoOn: t("game:controls.autoOn", { defaultValue: "an" }),
    autoOff: t("game:controls.autoOff", { defaultValue: "aus" }),
    autoTitle: t("game:controls.autoTitle", {
      defaultValue: "Auto-Modus: läuft automatisch weiter",
    }),
    skipQuestion: t("game:controls.skipQuestion", {
      defaultValue: "Frage überspringen",
    }),
    revealAnswer: t("game:controls.revealAnswer", {
      defaultValue: "Auflösen",
    }),
    addTime: t("game:controls.addTime", {
      defaultValue: "10 Sekunden dazugeben",
    }),
    subtractTime: t("game:controls.subtractTime", {
      defaultValue: "10 Sekunden wegnehmen",
    }),
    footer: t("game:controls.footer", { defaultValue: "Spielsteuerung" }),
    teamStatus: t("game:controls.teamStatus", {
      defaultValue: "Teamstatus",
    }),
  }

  const toggleAutoMode = () => {
    const nextValue = !isAutoMode
    if (autoMode === undefined) setInternalAutoMode(nextValue)
    onAutoModeChange?.(nextValue)
  }

  return (
    <footer
      data-testid="manager-action-footer"
      aria-label={labels.footer}
      className={clsx(
        "border-line sticky -bottom-4 z-10 -mx-4 -mb-4 flex shrink-0 flex-col gap-3 border-t bg-[var(--footer-bg)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-[var(--footer-text)] shadow-[0_-2px_8px_rgba(0,0,0,0.08)] sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        "motion-reduce:transition-none",
        className,
      )}
    >
      <div
        aria-label={labels.teamStatus}
        className="flex min-w-0 items-center gap-2 overflow-x-auto"
      >
        <span className="text-ink-muted shrink-0 text-sm font-semibold">
          {labels.teamStatus}
        </span>
        {teams.length > 0 ? (
          <ul className="flex min-w-0 items-center gap-2" role="list">
            {teams.map((team) => (
              <li
                key={team.id}
                className="border-line bg-surface-2 flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5"
              >
                <span
                  className={clsx(
                    "size-2 shrink-0 rounded-full",
                    statusIndicatorClasses[team.status],
                  )}
                  aria-hidden
                />
                <span className="text-ink text-sm font-medium">
                  {team.label}
                </span>
                <StatusBadge status={team.status}>
                  {team.detail ?? statusLabels[team.status]}
                </StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <StatusBadge status={status}>{statusLabels[status]}</StatusBadge>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={labels.footer}
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={clsx(
            "min-h-11",
            isAutoMode &&
              "border-accent-tint bg-accent-tint text-accent-contrast hover:bg-accent-tint",
          )}
          onClick={toggleAutoMode}
          aria-label={`${labels.autoMode}: ${isAutoMode ? labels.autoOn : labels.autoOff}`}
          aria-pressed={isAutoMode}
          title={labels.autoTitle}
        >
          <span
            aria-hidden
            className={clsx(
              "relative h-5 w-9 rounded-full transition-colors motion-reduce:transition-none",
              isAutoMode ? "bg-accent-contrast" : "bg-field-ink/20",
            )}
          >
            <span
              className={clsx(
                "absolute top-0.5 size-4 rounded-full bg-white transition-transform motion-reduce:transition-none",
                isAutoMode ? "translate-x-4" : "translate-x-0",
              )}
            />
          </span>
          <span>
            {labels.autoMode} {isAutoMode ? labels.autoOn : labels.autoOff}
          </span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={onSkipQuestion}
          aria-label={labels.skipQuestion}
          title={labels.skipQuestion}
        >
          <SkipForward className="size-5" aria-hidden />
          <span>{labels.skipQuestion}</span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={onRevealAnswer}
          aria-label={labels.revealAnswer}
          title={labels.revealAnswer}
        >
          <Eye className="size-5" aria-hidden />
          <span>{labels.revealAnswer}</span>
        </Button>

        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={labels.addTime}
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 px-3"
            onClick={onSubtractTime}
            aria-label={labels.subtractTime}
            title={labels.subtractTime}
          >
            <Minus className="size-5" aria-hidden />
            <span>−10s</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 px-3"
            onClick={onAddTime}
            aria-label={labels.addTime}
            title={labels.addTime}
          >
            <Plus className="size-5" aria-hidden />
            <span>+10s</span>
          </Button>
        </div>
      </div>
    </footer>
  )
}

export default ManagerActionFooter
