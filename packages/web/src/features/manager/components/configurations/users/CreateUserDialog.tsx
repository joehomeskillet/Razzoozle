import * as Dialog from "@radix-ui/react-dialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import Select from "@razzoozle/web/components/Select"
import { UserPlus, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { SyntheticEvent } from "react"

interface CreateUserDialogProps {
  isOpen: boolean
  onClose: () => void
  username: string
  onUsernameChange: (value: string) => void
  password: string
  onPasswordChange: (value: string) => void
  role: "user" | "admin" | "lehrkraft"
  onRoleChange: (value: "user" | "admin" | "lehrkraft") => void
  creating: boolean
  copySourceId: number | null
  onSubmit: (e: SyntheticEvent) => void
}

export default function CreateUserDialog({
  isOpen,
  onClose,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  role,
  onRoleChange,
  creating,
  copySourceId,
  onSubmit,
}: CreateUserDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface-1 p-6 shadow-xl border border-hairline focus:outline-none">
          <div className="flex items-center justify-between border-b border-hairline pb-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[var(--ink-muted)]" />
              <Dialog.Title className="text-lg font-bold text-ink">
                {copySourceId
                  ? t("manager:users.copyDialogTitle")
                  : t("manager:users.createTitle")}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1 text-[var(--ink-muted)] hover:bg-surface-2 hover:text-ink focus:outline-none"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">
                {t("manager:users.usernameLabel")}
              </label>
              <Input
                type="text"
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder={t("manager:users.usernamePlaceholder")}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">
                {t("manager:users.passwordLabel")}
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder={t("manager:users.passwordPlaceholder")}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">
                {t("manager:users.roleLabel")}
              </label>
              <Select
                value={role}
                onChange={(e) => onRoleChange(e.target.value as "user" | "admin" | "lehrkraft")}
              >
                <option value="user">
                  {t("manager:users.role.user")}
                </option>
                <option value="lehrkraft">
                  {t("manager:users.role.lehrkraft")}
                </option>
                <option value="admin">
                  {t("manager:users.role.admin")}
                </option>
              </Select>
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t("common:cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={creating}>
                {creating
                  ? t("common:saving")
                  : copySourceId
                    ? t("manager:users.copyUser")
                    : t("manager:users.create")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
