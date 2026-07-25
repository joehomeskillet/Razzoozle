import Badge from "@razzoozle/web/components/manager/Badge"
import OverflowMenu from "@razzoozle/web/components/manager/OverflowMenu"
import RowSelectionControl from "@razzoozle/web/components/manager/RowSelectionControl"
import { ListRow } from "@razzoozle/web/features/manager/components/console"
import type { ListRowAction } from "@razzoozle/web/features/manager/components/console"
import type { ManagedUser } from "./userManagementApi"
import { Ban, CheckCircle2, Copy, Key, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

interface UserManagementRowProps {
  user: ManagedUser
  isSelected: boolean
  onToggleSelect: () => void
  isPending: boolean
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
  currentUsername,
  onToggleActive,
  onCopyUser,
  onOpenResetPassword,
  onOpenDelete,
}: UserManagementRowProps) {
  const { t } = useTranslation()
  const isSelf = user.username === currentUsername

  const getRoleLabel = (roleValue: string) => {
    switch (roleValue) {
      case "admin":
        return t("manager:users.role.admin", { defaultValue: "Admin" })
      case "lehrkraft":
        return t("manager:users.role.lehrkraft", { defaultValue: "Lehrkraft" })
      case "user":
      default:
        return t("manager:users.role.user", { defaultValue: "Schüler/in" })
    }
  }

  const getRoleBadgeVariant = (roleValue: string) => {
    switch (roleValue) {
      case "admin":
        return "accent" as const
      case "lehrkraft":
        return "primary" as const
      case "user":
      default:
        return "neutral" as const
    }
  }

  const actions: ListRowAction[] = [
    {
      id: "toggle-active",
      label: user.active
        ? t("manager:users.disable", { defaultValue: "Deaktivieren" })
        : t("manager:users.enable", { defaultValue: "Aktivieren" }),
      icon: user.active ? Ban : CheckCircle2,
      onClick: () => onToggleActive(user),
      disabled: isPending || isSelf,
    },
    {
      id: "copy",
      label: t("manager:users.copy", { defaultValue: "Kopieren" }),
      icon: Copy,
      onClick: () => onCopyUser(user),
    },
    {
      id: "reset-password",
      label: t("manager:users.resetPassword", { defaultValue: "Passwort zurücksetzen" }),
      icon: Key,
      onClick: () => onOpenResetPassword(user),
    },
    {
      id: "delete",
      label: t("manager:users.delete", { defaultValue: "Löschen" }),
      icon: Trash2,
      destructive: true,
      onClick: () => onOpenDelete(user),
      disabled: isSelf,
    },
  ]

  return (
    <ListRow
      leadingControl={
        <RowSelectionControl
          selected={isSelected}
          onToggle={onToggleSelect}
          ariaLabel={t("manager:users.selectUser", { defaultValue: "Benutzer {{name}} auswählen", name: user.username })}
        />
      }
      title={user.username}
      meta={
        <div className="flex items-center gap-2">
          <Badge variant={getRoleBadgeVariant(user.role)}>
            {getRoleLabel(user.role)}
          </Badge>
          <Badge variant={user.active ? "success" : "danger"}>
            {user.active
              ? t("manager:users.active", { defaultValue: "Aktiv" })
              : t("manager:users.inactive", { defaultValue: "Inaktiv" })}
          </Badge>
        </div>
      }
      actions={<OverflowMenu actions={actions} />}
    />
  )
}
