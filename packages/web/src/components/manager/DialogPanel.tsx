import * as Dialog from "@radix-ui/react-dialog"
import { Portal, Overlay } from "@radix-ui/react-dialog"
import clsx from "clsx"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

export interface DialogPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titleId: string
  title: ReactNode
  children: ReactNode
  maxWidth?: "md" | "lg"
}

// Shared Radix Dialog chrome (overlay + centered content surface + the
// title/close header) that was duplicated verbatim across ConfigKlassen,
// CreateStudentDialog, PinDialog, CreateLabelDialog and EditLabelDialog.
// Callers only supply the title and body; open/close wiring, aria-labelledby
// and the close button's focus ring live here once.
const DialogPanel = ({
  open,
  onOpenChange,
  titleId,
  title,
  children,
  maxWidth = "lg",
}: DialogPanelProps) => {
  const { t } = useTranslation()

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-labelledby={titleId}
          className={clsx(
            "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-6 shadow-[var(--shadow-flat)]",
            maxWidth === "md" ? "max-w-md" : "max-w-lg",
          )}
        >
          <div className="flex items-center justify-between">
            <Dialog.Title id={titleId} className="text-lg font-semibold text-[var(--ink)]">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="flex min-h-11 min-w-11 items-center justify-center text-[var(--ink-faint)] hover:text-[var(--ink-medium)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                aria-label={t("common:close")}
              >
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          {children}
        </Dialog.Content>
      </Portal>
    </Dialog.Root>
  )
}

export default DialogPanel
