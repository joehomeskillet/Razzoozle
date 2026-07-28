import Loader from "@razzoozle/web/components/Loader"
import { EmptyState } from "@razzoozle/web/features/manager/components/console"
import type { ManagedUser } from "./userManagementApi"
import UserManagementRow from "./UserManagementRow"
import { Users as UsersIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

interface UserManagementListProps {
  loading: boolean
  hasAnyUsers: boolean
  filteredUsers: ManagedUser[]
  selection: { isSelected: (id: number) => boolean; toggle: (id: number) => void }
  pendingId: number | null
  busy: boolean
  currentUsername: string | null
  onToggleActive: (user: ManagedUser) => void
  onCopyUser: (user: ManagedUser) => void
  onOpenResetPassword: (user: ManagedUser) => void
  onOpenDelete: (user: ManagedUser) => void
}

export default function UserManagementList({
  loading,
  hasAnyUsers,
  filteredUsers,
  selection,
  pendingId,
  busy,
  currentUsername,
  onToggleActive,
  onCopyUser,
  onOpenResetPassword,
  onOpenDelete,
}: UserManagementListProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader className="h-16" />
      </div>
    )
  }

  if (filteredUsers.length === 0) {
    return hasAnyUsers ? (
      <EmptyState
        icon={UsersIcon}
        headline={t("manager:users.noMatchesHeadline")}
        hint={t("manager:users.noMatches")}
      />
    ) : (
      <EmptyState
        icon={UsersIcon}
        headline={t("manager:users.emptyHeadline")}
        hint={t("manager:users.empty")}
      />
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-0.5">
      {/* Header select-all + BulkActionToolbar live in ConfigUsers (above). */}
      {filteredUsers.map((user) => (
        <UserManagementRow
          key={user.id}
          user={user}
          isSelected={selection.isSelected(user.id)}
          onToggleSelect={() => selection.toggle(user.id)}
          isPending={pendingId === user.id}
          busy={busy}
          currentUsername={currentUsername}
          onToggleActive={onToggleActive}
          onCopyUser={onCopyUser}
          onOpenResetPassword={onOpenResetPassword}
          onOpenDelete={onOpenDelete}
        />
      ))}
    </div>
  )
}
