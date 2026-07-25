import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { Swords, Share2, Trophy } from "lucide-react"
import { useTranslation } from "react-i18next"

export interface ChallengeCardProps {
  creatorName: string
  creatorScore: number
  quizTitle: string
  onAccept?: () => void
  onShare?: () => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export function ChallengeCard({
  creatorName,
  creatorScore,
  quizTitle,
  onAccept,
  onShare,
  disabled = false,
  testIdPrefix = "",
  className,
}: ChallengeCardProps) {
  const { t } = useTranslation()

  return (
    <div
      className={clsx(
        "mx-auto flex w-full max-w-md flex-col gap-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)] text-center",
        className,
      )}
      data-testid={`${testIdPrefix}challenge-card`}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-tint text-accent-contrast">
        <Swords className="h-7 w-7" />
      </div>

      <div className="space-y-2">
        <h3 className="text-2xl font-black tracking-tight text-[var(--ink)]">
          {t("game:challenge.title", { defaultValue: "Herausforderung!" })}
        </h3>
        <p className="text-sm font-medium text-[var(--ink-muted)]">
          {t("game:challenge.subtitle", {
            defaultValue: "{{name}} fordert dich in {{quiz}} heraus!",
            name: creatorName,
            quiz: quizTitle,
          })}
        </p>
      </div>

      {/* Creator Score Badge */}
      <div
        className="flex items-center justify-center gap-2 rounded-xl bg-[var(--surface-2)] p-4"
        data-testid={`${testIdPrefix}challenge-score-box`}
      >
        <Trophy className="h-5 w-5 text-status-pending-text" />
        <span className="text-sm font-semibold text-[var(--ink-medium)]">
          {t("game:challenge.targetScore", {
            defaultValue: "Ziel: {{score}} Punkte",
            score: creatorScore,
          })}
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={disabled}
          onClick={onAccept}
          data-testid={`${testIdPrefix}challenge-accept`}
        >
          <Swords className="mr-2 h-4 w-4" />
          {t("game:challenge.acceptButton", { defaultValue: "Herausforderung annehmen" })}
        </Button>

        {onShare && (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={onShare}
            data-testid={`${testIdPrefix}challenge-share`}
          >
            <Share2 className="mr-2 h-4 w-4" />
            {t("game:challenge.shareButton", { defaultValue: "Freunde herausfordern" })}
          </Button>
        )}
      </div>
    </div>
  )
}
