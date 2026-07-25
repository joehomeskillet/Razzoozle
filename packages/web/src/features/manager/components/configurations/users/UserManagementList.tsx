import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
import SelectAllControl from "@razzoozle/web/components/manager/SelectAllControl"
import Button from "@razzoozle/web/components/Button"
import Loader from "@razzoozle/web/components/Loader"
import { EmptyState } from "@razzoozle/web/features/manager/components/console"
import type { ManagedUser } from "./userManagementApi"
import UserManagementRow from "./UserManagementRow"
import { Ban, CheckCircle2, Trash2, Users as UsersIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

interface UserManagementListProps {
  loading: boolean
  filteredUsers: ManagedUser[]
  selection: {
    selected: Set<number>
    isSelected: (id: number) => boolean
    toggle: (id: number) => void
    toggleAll: () => void
    clear: () => void
    allSelected: boolean
    someSelected: boolean
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
        headline={t("manager:users.noUsersTitle", { defaultValue: "Keine Benutzer gefunden" })}
        hint={t("manager:users.noUsersDescription", {
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
          id="select-all-users"
          allSelected={selection.allSelected}
          someSelected={selection.someSelected}
          selectedCount={selection.selected.size}
          totalCount={filteredUsers.length}
          onToggleAll={selection.toggleAll}
        />
      </div>

      {selection.selected.size > 0 && (
        <BulkActionToolbar
          count={selection.selected.size}
          label={t("manager:bulk.toolbarLabel", { defaultValue: "Benutzer Massenaktionen" })}
          onClear={selection.clear}
        >
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onTriggerBulkAction("activate")}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {t("manager:users.enable", { defaultValue: "Aktivieren" })}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onTriggerBulkAction("deactivate")}
            >
              <Ban className="mr-1 h-4 w-4" />
              {t("manager:users.disable", { defaultValue: "Deaktivieren" })}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => onTriggerBulkAction("delete")}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {t("manager:users.delete", { defaultValue: "Löschen" })}
            </Button>
          </div>
        </BulkActionToolbar>
      )}

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
