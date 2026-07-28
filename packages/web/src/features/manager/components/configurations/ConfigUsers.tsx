import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import SelectAllControl from "@razzoozle/web/components/manager/SelectAllControl"
import { ActionFooter } from "@razzoozle/web/components/ui"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useEntitySelection } from "@razzoozle/web/features/manager/hooks/useEntitySelection"
import { UserPlus } from "lucide-react"
import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  type ManagedUser,
  bulkUserActionApi,
  createUserApi,
  deleteUserApi,
  fetchUsers,
  parseErrorMessage,
  resetUserPasswordApi,
  toggleUserActiveApi,
} from "./users/userManagementApi"
import UserFilterPanel from "./users/UserFilterPanel"
import UserManagementList from "./users/UserManagementList"
import CreateUserDialog from "./users/CreateUserDialog"
import ResetPasswordDialog from "./users/ResetPasswordDialog"

const ConfigUsers = () => {
  const { t } = useTranslation()
  const currentUsername = useManagerStore((s) => s.username)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "lehrkraft" | "admin">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")

  // Create/Copy dialog
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"user" | "admin" | "lehrkraft">("user")
  const [creating, setCreating] = useState(false)
  const [copySourceId, setCopySourceId] = useState<number | null>(null)

  // Single Actions
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null)
  const [resetNewPassword, setResetNewPassword] = useState("")
  const [resettingPassword, setResettingPassword] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{
    id: number
    username: string
    role: string
  } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Bulk actions
  const [bulkAction, setBulkAction] = useState<"activate" | "deactivate" | "delete" | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkProcessing, setBulkProcessing] = useState(false)

  // Filtered list & selection hook
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        searchTerm === "" ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesRole =
        roleFilter === "all" || user.role === roleFilter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.active) ||
        (statusFilter === "inactive" && !user.active)
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchTerm, roleFilter, statusFilter])

  const selection = useEntitySelection<number>(filteredUsers.map((u) => u.id))

  // Bulk confirm dialog: first five affected usernames + "and N more"
  const bulkNamePreview = useMemo(() => {
    const selectedUsers = users.filter((u) => selection.selected.has(u.id))
    const names = selectedUsers.slice(0, 5).map((u) => u.username)
    const extra = selectedUsers.length - names.length
    if (extra > 0) {
      return `${names.join(", ")} ${t("manager:bulk.andNMore", { count: extra })}`
    }
    return names.join(", ")
  }, [users, selection.selected, t])

  const loadUsersData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchUsers()
      setUsers(data)
    } catch {
      toast.error(t("manager:users.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadUsersData()
  }, [loadUsersData])

  const handleCreate = async (event: SyntheticEvent) => {
    event.preventDefault()

    if (!username || !password) {
      toast.error(t("manager:users.invalidInput"))
      return
    }

    setCreating(true)
    try {
      const response = await createUserApi({ username, password, role })

      if (!response.ok) {
        toast.error((await parseErrorMessage(response)) ?? t("manager:users.createFailed"))
        return
      }

      toast.success(t("manager:users.created"))
      setUsername("")
      setPassword("")
      setRole("user")
      setCopySourceId(null)
      setIsCreateDialogOpen(false)
      await loadUsersData()
    } catch {
      toast.error(t("manager:users.networkError"))
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (user: ManagedUser) => {
    setPendingId(user.id)
    try {
      const response = await toggleUserActiveApi(user.id, user.active)
      if (!response.ok) {
        throw new Error(`status ${response.status}`)
      }

      toast.success(user.active ? t("manager:users.disabled") : t("manager:users.enabled"))
      await loadUsersData()
    } catch {
      toast.error(t("manager:users.toggleFailed"))
    } finally {
      setPendingId(null)
    }
  }

  const handleResetPassword = async (targetUser: ManagedUser) => {
    if (!resetNewPassword) {
      toast.error(t("manager:users.passwordRequired"))
      return
    }

    setResettingPassword(true)
    try {
      const response = await resetUserPasswordApi(targetUser.id, resetNewPassword)
      if (!response.ok) {
        throw new Error(`status ${response.status}`)
      }

      toast.success(t("manager:users.passwordReset"))
      setResetUser(null)
      setResetNewPassword("")
      await loadUsersData()
    } catch {
      toast.error(t("manager:users.resetFailed"))
    } finally {
      setResettingPassword(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete || deleting) return

    setDeleting(true)
    try {
      const response = await deleteUserApi(pendingDelete.id)
      if (!response.ok) {
        toast.error((await parseErrorMessage(response)) ?? t("manager:users.deleteFailed"))
        return
      }

      toast.success(t("manager:users.deleted", { name: pendingDelete.username }))
      setPendingDelete(null)
      await loadUsersData()
    } catch {
      toast.error(t("manager:users.toggleFailed"))
    } finally {
      setDeleting(false)
    }
  }

  const handleBulkAction = async () => {
    if (!bulkAction || selection.selected.size === 0) return

    setBulkProcessing(true)
    try {
      const result = await bulkUserActionApi(bulkAction, Array.from(selection.selected))

      const parts: string[] = []
      if (result.succeeded.length > 0) {
        parts.push(t("manager:bulk.resultSucceeded", { count: result.succeeded.length }))
      }
      if (result.skipped.length > 0) {
        parts.push(t("manager:bulk.resultSkipped", { count: result.skipped.length }))
      }
      if (result.failed.length > 0) {
        parts.push(t("manager:bulk.resultFailed", { count: result.failed.length }))
      }

      const message = parts.length > 0 ? parts.join(", ") : t("manager:bulk.resultCompleted")
      toast.success(message)

      selection.clear()
      setBulkConfirm(false)
      setBulkAction(null)
      await loadUsersData()
    } catch {
      toast.error(t("errors:bulkFailed"))
    } finally {
      setBulkProcessing(false)
    }
  }

  const handleCopyUser = (sourceUser: ManagedUser) => {
    if (currentUsername != null && sourceUser.username === currentUsername) {
      toast.error(
        t("manager:users.cannot_copy_self", {
          defaultValue: "Du kannst dein eigenes Konto nicht kopieren",
        }),
      )
      return
    }

    setCopySourceId(sourceUser.id)
    setUsername(`${sourceUser.username}-kopie`)
    setPassword("")
    setRole(sourceUser.role as "user" | "admin" | "lehrkraft")
    setIsCreateDialogOpen(true)
  }

  return (
    <>
    {/* No min-h-0 here: it breaks sticky ActionFooter (sibling) — see ActionFooter.tsx */}
    <div className="flex flex-1 flex-col gap-4 pb-20">
      <PageHeader
        title={t("manager:users.title")}
        subtitle={t("manager:users.intro")}
        action={
          <Button
            variant="primary"
            onClick={() => {
              setCopySourceId(null)
              setUsername("")
              setPassword("")
              setRole("user")
              setIsCreateDialogOpen(true)
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {t("manager:users.create")}
          </Button>
        }
      />

      <UserFilterPanel
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {/* bulk toolbar after filter pills, before SelectAllControl + StudentList */}
      {selection.selectionActive && (
        <BulkActionToolbar
          count={selection.selected.size}
          label={t("manager:bulk.selected", { count: selection.selected.size })}
          onClear={selection.clear}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBulkAction("activate")
              setBulkConfirm(true)
            }}
            disabled={bulkProcessing}
          >
            {t("manager:bulk.activate")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBulkAction("deactivate")
              setBulkConfirm(true)
            }}
            disabled={bulkProcessing}
          >
            {t("manager:bulk.deactivate")}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setBulkAction("delete")
              setBulkConfirm(true)
            }}
            disabled={bulkProcessing}
          >
            {t("manager:bulk.deleteSelected")}
          </Button>
        </BulkActionToolbar>
      )}

      {filteredUsers.length > 0 && (
        <SelectAllControl
          id="users-select-all"
          data-testid="users-select-all"
          allSelected={selection.allSelected}
          someSelected={selection.someSelected}
          selectedCount={selection.selected.size}
          totalCount={filteredUsers.length}
          onToggleAll={selection.toggleAll}
        />
      )}

      <UserManagementList
        loading={loading}
        hasAnyUsers={users.length > 0}
        filteredUsers={filteredUsers}
        selection={selection}
        pendingId={pendingId}
        busy={resettingPassword || deleting || bulkProcessing}
        currentUsername={currentUsername}
        onToggleActive={handleToggleActive}
        onCopyUser={handleCopyUser}
        onOpenResetPassword={(u) => {
          setResetUser(u)
          setResetNewPassword("")
        }}
        onOpenDelete={(u) => setPendingDelete({ id: u.id, username: u.username, role: u.role })}
      />

      <CreateUserDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        username={username}
        onUsernameChange={setUsername}
        password={password}
        onPasswordChange={setPassword}
        role={role}
        onRoleChange={setRole}
        creating={creating}
        copySourceId={copySourceId}
        onSubmit={handleCreate}
      />

      <ResetPasswordDialog
        user={resetUser}
        isOpen={Boolean(resetUser)}
        onClose={() => setResetUser(null)}
        newPassword={resetNewPassword}
        onPasswordChange={setResetNewPassword}
        resetting={resettingPassword}
        onSubmit={handleResetPassword}
      />

      {/* Delete Confirmation Alert */}
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("manager:users.deleteConfirmTitle")}
        description={
          pendingDelete
            ? pendingDelete.role === "lehrkraft"
              ? `${t("manager:users.deleteConfirmDescription", { name: pendingDelete.username })}\n\n${t("manager:users.deleteConfirmCascade")}`
              : t("manager:users.deleteConfirmDescription", { name: pendingDelete.username })
            : ""
        }
        confirmLabel={t("manager:users.delete")}
        confirmDisabled={deleting}
        onConfirm={handleDelete}
      />

      {/* Bulk Action Confirmation Alert */}
      <AlertDialog
        open={bulkConfirm}
        onOpenChange={(open) => !open && setBulkConfirm(false)}
        title={
          bulkAction === "activate"
            ? t("manager:users.bulkConfirmTitleActivate", { count: selection.selected.size })
            : bulkAction === "deactivate"
              ? t("manager:users.bulkConfirmTitleDeactivate", { count: selection.selected.size })
              : bulkAction === "delete"
                ? t("manager:users.bulkConfirmTitleDelete", { count: selection.selected.size })
                : ""
        }
        description={bulkAction ? bulkNamePreview : ""}
        confirmLabel={t("common:confirm")}
        confirmDisabled={bulkProcessing}
        onConfirm={handleBulkAction}
      />
    </div>

    <ActionFooter>
      <span />
    </ActionFooter>
    </>
  )
}

export default ConfigUsers
