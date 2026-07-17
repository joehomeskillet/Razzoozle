import Button from "@razzoozle/web/components/Button"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import { RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { PinView } from "./useSchuelerManager"

interface PinDialogProps {
  data: PinView | null
  onClose: () => void
  onRequestRegen: (studentId: number) => void
}

// Some emoji in the PIN set are multi-codepoint (base + U+FE0F variation
// selector, e.g. "🕷️" or "✈️"), so splitting the joined `pin` string by
// Unicode code point (Array.from) fragments those into extra tiles. Split by
// grapheme cluster instead when Intl.Segmenter is available; Array.from is
// the last-resort fallback for engines without it.
const splitGraphemes = (value: string): string[] => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    return Array.from(segmenter.segment(value), (s) => s.segment)
  }
  return Array.from(value)
}

// PinDialog — read-only display of a student's 4-emoji login code (the pin
// string is the 4 emoji joined; labels are the matching German words). Shown
// right after creating a student and whenever a teacher clicks "PIN" on an
// existing row. Never rendered inside a list row — only here, on demand.
const PinDialog = ({ data, onClose, onRequestRegen }: PinDialogProps) => {
  const { t } = useTranslation()

  if (!data) {
    return null
  }

  // Prefer the server-provided grapheme-safe `symbols` array (index-aligned
  // with `labels`); fall back to splitting `pin` client-side when the server
  // doesn't send it yet.
  const emojis = data.symbols ?? splitGraphemes(data.pin)

  return (
    <DialogPanel
      open={!!data}
      onOpenChange={onClose}
      titleId="pin-dialog-title"
      title={t("manager:schueler.pinTitle")}
    >
      <p className="mt-2 text-sm text-[var(--ink-subtle)]">
        {t("manager:schueler.pinHint")}
      </p>

      <div className="mt-6 grid grid-cols-4 gap-3">
        {emojis.map((emoji, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div
              role="img"
              aria-label={data.labels[i] ?? emoji}
              className="flex size-16 min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] text-5xl text-[var(--ink)]"
            >
              {emoji}
            </div>
            <span className="text-center text-xs font-medium text-[var(--ink-subtle)]">
              {data.labels[i]}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          className="rounded-[var(--radius-theme)]"
          onClick={() => onRequestRegen(data.studentId)}
        >
          <RefreshCw className="size-4" />
          {t("manager:schueler.regenPin")}
        </Button>
        <Button variant="primary" className="rounded-[var(--radius-theme)]" onClick={onClose}>
          {t("common:close")}
        </Button>
      </div>
    </DialogPanel>
  )
}

export default PinDialog
