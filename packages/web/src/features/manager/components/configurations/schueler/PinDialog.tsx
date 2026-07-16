import * as Dialog from "@radix-ui/react-dialog"
import { Portal, Overlay } from "@radix-ui/react-dialog"
import Button from "@razzoozle/web/components/Button"
import { RefreshCw, X } from "lucide-react"
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
    <Dialog.Root open={!!data} onOpenChange={onClose}>
      <Portal>
        <Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-6 shadow-lg" role="alertdialog">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-[var(--ink)]">
              {t("manager:schueler.pinTitle")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="flex min-h-11 min-w-11 items-center justify-center text-[var(--ink-faint)] hover:text-[var(--ink-medium)]" aria-label={t('common:close')}>
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

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
        </Dialog.Content>
      </Portal>
    </Dialog.Root>
  )
}

export default PinDialog
