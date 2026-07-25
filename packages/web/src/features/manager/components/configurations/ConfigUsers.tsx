import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
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

  const loadUsersData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchUsers()
      setUsers(data)
    } catch {
      toast.error(t("manager:users.loadFailed", { defaultValue: "Fehler beim Laden der Benutzer" }))
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
      toast.error(t("manager:users.invalidInput", { defaultValue: "Bitte Benutzername und Passwort eingeben" }))
      return
    }

    setCreating(true)
    try {
      const response = await createUserApi({ username, password, role })

      if (!response.ok) {
        toast.error(
          (await parseErrorMessage(response)) ??
            t("manager:users.createFailed", { defaultValue: "Fehler beim Erstellen des Benutzers" }),
        )
        return
      }

      toast.success(t("manager:users.created", { defaultValue: "Benutzer erfolgreich erstellt" }))
      setUsername("")
      setPassword("")
      setRole("user")
      setCopySourceId(null)
      setIsCreateDialogOpen(false)
      await loadUsersData()
    } catch {
      toast.error(t("manager:users.networkError", { defaultValue: "Netzwerkfehler beim Erstellen" }))
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

      toast.success(
        user.active
          ? t("manager:users.disabled", { defaultValue: "Benutzer deaktiviert" })
          : t("manager:users.enabled", { defaultValue: "Benutzer aktiviert" }),
      )
      await loadUsersData()
    } catch {
      toast.error(t("manager:users.toggleFailed", { defaultValue: "Fehler beim Ändern des Status" }))
    } finally {
      setPendingId(null)
    }
  }

  const handleResetPassword = async (targetUser: ManagedUser) => {
    if (!resetNewPassword) {
      toast.error(t("manager:users.passwordRequired", { defaultValue: "Neues Passwort erforderlich" }))
      return
    }

    setResettingPassword(true)
    try {
      const response = await resetUserPasswordApi(targetUser.id, resetNewPassword)
      if (!response.ok) {
        throw new Error(`status ${response.status}`)
      }

      toast.success(t("manager:users.passwordReset", { defaultValue: "Passwort erfolgreich zurückgesetzt" }))
      setResetUser(null)
      setResetNewPassword("")
      await loadUsersData()
    } catch {
      toast.error(t("manager:users.resetFailed", { defaultValue: "Fehler beim Zurücksetzen" }))
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
        toast.error(
          (await parseErrorMessage(response)) ??
            t("manager:users.deleteFailed", { defaultValue: "Fehler beim Löschen des Benutzers" }),
        )
        return
      }

      toast.success(t("manager:users.deleted", { defaultValue: "Benutzer {{name}} gelöscht", name: pendingDelete.username }))
      setPendingDelete(null)
      await loadUsersData()
    } catch {
      toast.error(t("manager:users.toggleFailed", { defaultValue: "Fehler beim Löschen" }))
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

      const message = parts.length > 0 ? parts.join(", ") : t("manager:bulk.resultCompleted", { defaultValue: "Aktion abgeschlossen" })
      toast.success(message)

      selection.clear()
      setBulkConfirm(false)
      setBulkAction(null)
      await loadUsersData()
    } catch {
      toast.error(t("manager:users.bulkFailed", { defaultValue: "Bulk-Aktion fehlgeschlagen" }))
    } finally {
      setBulkProcessing(false)
    }
  }

  const handleCopyUser = (sourceUser: ManagedUser) => {
    setUsername(`${sourceUser.username}_copy`)
    setRole(sourceUser.role as "user" | "admin" | "lehrkraft")
    setCopySourceId(sourceUser.id)
    setIsCreateDialogOpen(true)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        title={t("manager:users.title", { defaultValue: "Benutzerverwaltung" })}
        subtitle={t("manager:users.subtitle", { defaultValue: "Verwalte Konten, Rollen und Berechtigungen" })}
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
            {t("manager:users.createButton", { defaultValue: "Benutzer anlegen" })}
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

      <UserManagementList
        loading={loading}
        filteredUsers={filteredUsers}
        selection={selection}
        pendingId={pendingId}
        currentUsername={currentUsername}
        onToggleActive={handleToggleActive}
        onCopyUser={handleCopyUser}
        onOpenResetPassword={(u) => {
          setResetUser(u)
          setResetNewPassword("")
        }}
        onOpenDelete={(u) => setPendingDelete({ id: u.id, username: u.username, role: u.role })}
        onTriggerBulkAction={(act) => {
          setBulkAction(act)
          setBulkConfirm(true)
        }}
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
        title={t("manager:users.deleteConfirmTitle", { defaultValue: "Benutzer löschen" })}
        description={
          pendingDelete
            ? t("manager:users.deleteConfirmDescription", { defaultValue: "Möchtest du {{name}} wirklich löschen?", name: pendingDelete.username })
            : ""
        }
        confirmLabel={t("manager:common.delete", { defaultValue: "Löschen" })}
        confirmDisabled={deleting}
        onConfirm={handleDelete}
      />

      {/* Bulk Action Confirmation Alert */}
      <AlertDialog
        open={bulkConfirm}
        onOpenChange={(open) => !open && setBulkConfirm(false)}
        title={t("manager:bulk.confirmTitle", { defaultValue: "Massen-Aktion bestätigen" })}
        description={
          bulkAction
            ? `${selection.selected.size} Benutzer ${bulkAction}`
            : ""
        }
        confirmLabel={t("manager:common.confirm", { defaultValue: "Bestätigen" })}
        confirmDisabled={bulkProcessing}
        onConfirm={handleBulkAction}
      />

      <ActionFooter>
        <span />
      </ActionFooter>
    </div>
  )
}

export default ConfigUsers
