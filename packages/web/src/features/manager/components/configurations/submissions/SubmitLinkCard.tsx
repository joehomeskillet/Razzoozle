import Button from "@razzoozle/web/components/Button"
import { Copy } from "lucide-react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const SubmitLinkCard = () => {
  const { t } = useTranslation()

  const submitUrl = `${window.location.origin}/submit`

  const handleCopySubmitLink = async () => {
    try {
      await navigator.clipboard.writeText(submitUrl)
      toast.success(t("common:copied", { defaultValue: "Kopiert" }))
    } catch {
      toast.error(t("manager:result.share.copyFailed"))
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-2 rounded-xl bg-gray-50 p-4 text-center">
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {t("manager:submissions.submitLinkHint", {
          defaultValue: "Öffentlicher Einreichungs-Link",
        })}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-left text-sm text-gray-700 outline-1 -outline-offset-1 outline-gray-200">
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
          aria-label={t("manager:submissions.copyLink", {
            defaultValue: "Link kopieren",
          })}
          title={t("manager:submissions.copyLink", {
            defaultValue: "Link kopieren",
          })}
        >
          <Copy className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export { SubmitLinkCard }
