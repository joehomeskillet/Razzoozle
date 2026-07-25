import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
import SelectAllControl from "@razzoozle/web/components/manager/SelectAllControl"
import Loader from "@razzoozle/web/components/Loader"
import { EmptyState } from "@razzoozle/web/features/manager/components/console"
import type { ManagedUser } from "./userManagementApi"
import UserManagementRow from "./UserManagementRow"
import { Users as UsersIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

interface UserManagementListProps {
  loading: boolean
  filteredUsers: ManagedUser[]
  selection: {
    selected: Set<number>
    isSelected: (id: number) => boolean
    toggle: (id: number) => void
    selectAll: () => void
    clear: () => void
    isAllSelected: boolean
    isSomeSelected: boolean
  }
  pendingId: number | null
  currentUsername: string | null
  onToggleActive: (user: ManagedUser) => void
  onCopyUser: (user: ManagedUser) => void
  onOpenResetPassword: (user: ManagedUser) => void
  onOpenDelete: (user: ManagedUser) => void
  onTriggerBulkAction: (action: "activate" | "deactivate" | "delete") => void
}

export default function UserManagementList({
  loading,
  filteredUsers,
  selection,
  pendingId,
  currentUsername,
  onToggleActive,
  onCopyUser,
  onOpenResetPassword,
  onOpenDelete,
  onTriggerBulkAction,
}: UserManagementListProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader />
      </div>
    )
  }

  if (filteredUsers.length === 0) {
    return (
      <EmptyState
        icon={UsersIcon}
        title={t("manager:users.noUsersTitle", { defaultValue: "Keine Benutzer gefunden" })}
        description={t("manager:users.noUsersDescription", {
          defaultValue: "Es wurden keine Benutzer gefunden, die den Filtern entsprechen.",
        })}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Selection controls & bulk bar */}
      <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-2">
        <SelectAllControl
          allSelected={selection.isAllSelected}
          someSelected={selection.isSomeSelected}
          onToggleAll={() => {
            if (selection.isAllSelected) {
              selection.clear()
            } else {
              selection.selectAll()
            }
          }}
          label={t("manager:users.selectAll", { defaultValue: "Alle auswählen" })}
        />

        {selection.selected.size > 0 && (
          <BulkActionToolbar
            selectedCount={selection.selected.size}
            onActivate={() => onTriggerBulkAction("activate")}
            onDeactivate={() => onTriggerBulkAction("deactivate")}
            onDelete={() => onTriggerBulkAction("delete")}
          />
        )}
      </div>

      {/* Rows */}
      <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface-1">
        {filteredUsers.map((user) => (
          <UserManagementRow
            key={user.id}
            user={user}
            isSelected={selection.isSelected(user.id)}
            onToggleSelect={() => selection.toggle(user.id)}
            isPending={pendingId === user.id}
            currentUsername={currentUsername}
            onToggleActive={onToggleActive}
            onCopyUser={onCopyUser}
            onOpenResetPassword={onOpenResetPassword}
            onOpenDelete={onOpenDelete}
          />
        ))}
      </div>
    </div>
  )
}
