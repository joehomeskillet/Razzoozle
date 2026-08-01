import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import { Key } from "lucide-react"
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
    <DialogPanel
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      titleId="reset-user-password-dialog-title"
      title={
        <span className="flex items-center gap-2">
          <Key aria-hidden="true" className="size-5 text-[var(--ink-muted)]" />
          <span>{t("manager:users.resetPasswordTitle")}</span>
        </span>
      }
      maxWidth="md"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(user)
        }}
        className="mt-4 flex flex-col gap-4"
      >
        <div>
          <label
            htmlFor="reset-user-password"
            className="text-ink mb-1 block text-sm font-semibold"
          >
            {t("manager:users.passwordLabel")}
          </label>
          <Input
            id="reset-user-password"
            type="password"
            autoComplete="new-password"
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
          <Button
            type="submit"
            variant="primary"
            disabled={resetting || !newPassword}
          >
            {resetting ? t("common:saving") : t("manager:users.resetPassword")}
          </Button>
        </div>
      </form>
    </DialogPanel>
  )
}
