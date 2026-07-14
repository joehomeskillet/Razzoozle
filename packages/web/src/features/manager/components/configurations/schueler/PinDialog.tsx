import Button from "@razzoozle/web/components/Button"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          {t("manager:schueler.pinTitle")}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {t("manager:schueler.pinHint")}
        </p>

        <div className="mt-6 grid grid-cols-4 gap-3">
          {emojis.map((emoji, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div
                role="img"
                aria-label={data.labels[i] ?? emoji}
                className="flex size-16 min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] text-5xl text-gray-900"
              >
                {emoji}
              </div>
              <span className="text-center text-xs font-medium text-gray-500">
                {data.labels[i]}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            className="rounded-xl"
            onClick={() => onRequestRegen(data.studentId)}
          >
            <RefreshCw className="size-4" />
            {t("manager:schueler.regenPin")}
          </Button>
          <Button variant="primary" className="rounded-xl" onClick={onClose}>
            {t("common:close")}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default PinDialog
