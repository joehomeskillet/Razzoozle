import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import Select from "@razzoozle/web/components/Select"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import { UserPlus } from "lucide-react"
import { useEffect, useRef } from "react"
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
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const title = copySourceId
    ? t("manager:users.copyDialogTitle")
    : t("manager:users.createTitle")

  useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    return () => {
      const previousFocus = previousFocusRef.current
      previousFocusRef.current = null

      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [isOpen])

  return (
    <DialogPanel
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      titleId="create-user-dialog-title"
      title={
        <span className="flex items-center gap-2">
          <UserPlus
            aria-hidden="true"
            className="size-5 text-[var(--ink-muted)]"
          />
          <span>{title}</span>
        </span>
      }
      maxWidth="md"
    >
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <div>
          <label
            htmlFor="create-user-username"
            className="text-ink mb-1 block text-sm font-semibold"
          >
            {t("manager:users.usernameLabel")}
          </label>
          <Input
            id="create-user-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder={t("manager:users.usernamePlaceholder")}
            required
          />
        </div>

        <div>
          <label
            htmlFor="create-user-password"
            className="text-ink mb-1 block text-sm font-semibold"
          >
            {t("manager:users.passwordLabel")}
          </label>
          <Input
            id="create-user-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={t("manager:users.passwordPlaceholder")}
            required
          />
        </div>

        <div>
          <label
            htmlFor="create-user-role"
            className="text-ink mb-1 block text-sm font-semibold"
          >
            {t("manager:users.roleLabel")}
          </label>
          <Select
            id="create-user-role"
            value={role}
            onChange={(e) =>
              onRoleChange(e.target.value as "user" | "admin" | "lehrkraft")
            }
          >
            <option value="user">{t("manager:users.role.user")}</option>
            <option value="lehrkraft">
              {t("manager:users.role.lehrkraft")}
            </option>
            <option value="admin">{t("manager:users.role.admin")}</option>
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
    </DialogPanel>
  )
}
