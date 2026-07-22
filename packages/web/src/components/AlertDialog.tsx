import * as RadixAlertDialog from "@radix-ui/react-alert-dialog"
import Button from "@razzoozle/web/components/Button"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  /** Element that opens the dialog. Omit for controlled use (`open`/`onOpenChange`). */
  trigger?: ReactNode
  title: string
  description: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  /** Controlled open state. When provided, the dialog is driven by the caller. */
  open?: boolean
  /** Controlled open-state change handler (paired with `open`). */
  onOpenChange?: (open: boolean) => void
  /** Optional disabled state for the confirm button (e.g., for form validation gates). */
  confirmDisabled?: boolean
}

const AlertDialog = ({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  open,
  onOpenChange,
  confirmDisabled,
}: Props) => {
  const { t } = useTranslation()

  return (
    <RadixAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <RadixAlertDialog.Trigger asChild>{trigger}</RadixAlertDialog.Trigger>
      )}

      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/40" />

        <RadixAlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-6 shadow-[var(--shadow-flat)]">
          <RadixAlertDialog.Title className="text-lg font-semibold text-[var(--ink)]">
            {title}
          </RadixAlertDialog.Title>

          <RadixAlertDialog.Description className="mt-2 whitespace-pre-line text-[var(--ink-subtle)]">
            {description}
          </RadixAlertDialog.Description>

          <div className="mt-6 flex justify-end gap-2">
            <RadixAlertDialog.Cancel asChild>
              <Button variant="secondary">{t("common:cancel")}</Button>
            </RadixAlertDialog.Cancel>

            <RadixAlertDialog.Action asChild>
              <Button variant="danger" onClick={onConfirm} disabled={confirmDisabled}>
                {confirmLabel ?? t("common:confirm")}
              </Button>
            </RadixAlertDialog.Action>
          </div>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  )
}

export default AlertDialog
