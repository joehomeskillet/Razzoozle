import Badge from "@razzoozle/web/components/manager/Badge"
import OverflowMenu from "@razzoozle/web/components/manager/OverflowMenu"
import RowSelectionControl from "@razzoozle/web/components/manager/RowSelectionControl"
import { ListRow } from "@razzoozle/web/features/manager/components/console"
import type { ListRowAction } from "@razzoozle/web/features/manager/components/console"
import type { ManagedUser } from "./userManagementApi"
import { Ban, CheckCircle2, Copy, Key, Trash2, UserCog } from "lucide-react"
import { useTranslation } from "react-i18next"

interface UserManagementRowProps {
  user: ManagedUser
  isSelected: boolean
  onToggleSelect: () => void
  isPending: boolean
  busy: boolean
  currentUsername: string | null
  onToggleActive: (user: ManagedUser) => void
  onCopyUser: (user: ManagedUser) => void
  onOpenResetPassword: (user: ManagedUser) => void
  onOpenDelete: (user: ManagedUser) => void
}

export default function UserManagementRow({
  user,
  isSelected,
  onToggleSelect,
  isPending,
  busy,
  currentUsername,
  onToggleActive,
  onCopyUser,
  onOpenResetPassword,
  onOpenDelete,
}: UserManagementRowProps) {
  const { t } = useTranslation()
  const isSelf = currentUsername != null && user.username === currentUsername
  const isBusy = isPending || busy

  const getRoleLabel = (roleValue: string) => {
    switch (roleValue) {
      case "admin":
        return t("manager:users.role.admin")
      case "lehrkraft":
        return t("manager:users.role.lehrkraft")
      case "user":
      default:
        return t("manager:users.role.user")
    }
  }

  const allActions: ListRowAction[] = [
    {
      key: "copy",
      icon: Copy,
      label: t("manager:users.copyUser"),
      disabled: isBusy || isSelf,
      title: isSelf
        ? t("manager:users.cannot_copy_self", { defaultValue: "Du kannst dein eigenes Konto nicht kopieren" })
        : t("manager:users.copyUser"),
      onClick: () => onCopyUser(user),
      className: "max-sm:hidden",
    },
    {
      key: "reset",
      icon: Key,
      label: t("manager:users.resetPassword"),
      disabled: isBusy,
      onClick: () => onOpenResetPassword(user),
    },
    {
      key: "toggle",
      icon: user.active ? Ban : CheckCircle2,
      label: user.active ? t("manager:users.disable") : t("manager:users.enable"),
      destructive: user.active,
      disabled: isBusy || isSelf,
      title: isSelf
        ? user.active
          ? t("manager:users.cannot_deactivate_self")
          : t("manager:users.cannot_modify_own_account")
        : undefined,
      onClick: () => {
        if (isSelf) return
        onToggleActive(user)
      },
      className: "max-sm:hidden",
    },
    {
      key: "delete",
      icon: Trash2,
      label: t("manager:users.delete"),
      destructive: true,
      disabled: isBusy || isSelf,
      title: isSelf ? t("manager:users.cannot_delete_self") : undefined,
      onClick: () => {
        if (isSelf) return
        onOpenDelete(user)
      },
      className: "max-sm:hidden",
    },
  ]

  return (
    <ListRow
      className="min-w-0"
      selected={isSelected}
      selection={
        <RowSelectionControl
          checked={isSelected}
          onChange={onToggleSelect}
          ariaLabel={t("manager:users.selectUser", { name: user.username })}
          data-testid={`user-select-${user.id}`}
        />
      }
      leading={<UserCog className="size-5 shrink-0 text-[var(--ink-muted)]" />}
      title={user.username}
      meta={
        <span className="flex flex-wrap items-center gap-2">
          <Badge>{getRoleLabel(user.role)}</Badge>
          <Badge tone={user.active ? "success" : "danger"}>
            {user.active ? t("manager:users.active") : t("manager:users.disabledStatus")}
          </Badge>
        </span>
      }
      actions={allActions}
      overflow={
        <span className="sm:hidden">
          <OverflowMenu
            actions={allActions.filter((a) => a.key === "copy" || a.key === "toggle" || a.key === "delete")}
          />
        </span>
      }
    />
  )
}
