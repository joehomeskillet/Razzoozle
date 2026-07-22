import Button from "@razzoozle/web/components/Button"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { Copy } from "lucide-react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Per-user opaque submission link (users.submit_token). NEVER the username —
// an unguessable per-user token identifies the receiving manager on the
// public POST /api/submit/:token endpoint. Until the socket/emitConfig layer
// populates `submitToken` (backend follow-up), render a clear "not
// available" state instead of inventing a fallback URL.
const SubmitLinkCard = () => {
  const { t } = useTranslation()
  const { submitToken } = useConfig()

  if (!submitToken) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-1 rounded-[var(--radius-theme)] bg-[var(--surface-2)] p-4 text-center">
        <p className="text-xs font-semibold tracking-wide text-[var(--ink-subtle)] uppercase">
          {t("manager:submissions.submitLinkHint")}
        </p>
        <p className="text-sm text-[var(--ink-subtle)]">
          {t("manager:submissions.submitLinkUnavailable")}
        </p>
      </div>
    )
  }

  const submitUrl = `${window.location.origin}/api/submit/${submitToken}`

  const handleCopySubmitLink = async () => {
    try {
      await navigator.clipboard.writeText(submitUrl)
      toast.success(t("common:copied"))
    } catch {
      toast.error(t("manager:result.share.copyFailed"))
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-2 rounded-[var(--radius-theme)] bg-[var(--surface-2)] p-4 text-center">
      <p className="text-xs font-semibold tracking-wide text-[var(--ink-subtle)] uppercase">
        {t("manager:submissions.submitLinkHint")}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--ink-muted)] outline-1 -outline-offset-1 outline-[var(--line)]">
          {submitUrl}
        </code>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          className="min-h-11 shrink-0"
          onClick={() => {
            void handleCopySubmitLink()
          }}
          aria-label={t("manager:submissions.copyLink")}
          title={t("manager:submissions.copyLink")}
        >
          <Copy className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export { SubmitLinkCard }
