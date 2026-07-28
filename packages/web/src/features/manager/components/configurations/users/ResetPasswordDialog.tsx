import * as Dialog from "@radix-ui/react-dialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { Key, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { ManagedUser } from "./userManagementApi"

interface ResetPasswordDialogProps {
  user: ManagedUser | null
  isOpen: boolean
  onClose: () => void
  newPassword: string
  onPasswordChange: (value: string) => void
  resetting: boolean
  onSubmit: (user: ManagedUser) => void
}

export default function ResetPasswordDialog({
  user,
  isOpen,
  onClose,
  newPassword,
  onPasswordChange,
  resetting,
  onSubmit,
}: ResetPasswordDialogProps) {
  const { t } = useTranslation()

  if (!user) return null

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface-1 p-6 shadow-xl border border-hairline focus:outline-none">
          <div className="flex items-center justify-between border-b border-hairline pb-4">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-ink-muted" />
              <Dialog.Title className="text-lg font-bold text-ink">
                {t("manager:users.resetPasswordTitle")}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1 text-ink-muted hover:bg-surface-2 hover:text-ink focus:outline-none"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit(user)
            }}
            className="mt-4 flex flex-col gap-4"
          >
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">
                {t("manager:users.passwordLabel")}
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder={t("manager:users.enterNewPassword")}
                required
              />
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t("common:cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={resetting || !newPassword}>
                {resetting
                  ? t("common:saving")
                  : t("manager:users.resetPassword")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
