import * as Dialog from "@radix-ui/react-dialog"
import { Portal, Overlay } from "@radix-ui/react-dialog"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Badge from "@razzoozle/web/components/manager/Badge"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import Select from "@razzoozle/web/components/Select"
import Loader from "@razzoozle/web/components/Loader"
import OverflowMenu from "@razzoozle/web/components/manager/OverflowMenu"
import { ActionFooter } from "@razzoozle/web/components/ui"
import { fetchWithAuth } from "@razzoozle/web/lib/api"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import {
  EmptyState,
  ListRow,
} from "@razzoozle/web/features/manager/components/console"
import type { ListRowAction } from "@razzoozle/web/features/manager/components/console"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useEntitySelection } from "@razzoozle/web/features/manager/hooks/useEntitySelection"
import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
import SelectAllControl from "@razzoozle/web/components/manager/SelectAllControl"
import RowSelectionControl from "@razzoozle/web/components/manager/RowSelectionControl"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import FilterGroup from "@razzoozle/web/components/manager/FilterGroup"
import {
  Ban,
  CheckCircle2,
  Copy,
  UserCog,
  UserPlus,
  Users as UsersIcon,
  Key,
  Trash2,
  X,
} from "lucide-react"
import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface ManagedUser {
  id: number
  username: string
  role: string
  active: boolean
  created_at: string
}

interface BulkResponse {
  succeeded: number[]
  skipped: Array<{ id: number; reason: string }>
  failed: Array<{ id: number; reason: string }>
}

const parseErrorMessage = async (
  response: Response,
): Promise<string | null> => {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === "object" && "error" in body) {
      const { error } = body as { error?: unknown }
      return typeof error === "string" ? error : null
    }
  } catch {
    // Non-JSON error body — fall back to caller's generic message
  }
  return null
}

const ConfigUsers = () => {
  const { t } = useTranslation()
  const config = useConfig()
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

  // Other single actions
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [resetPasswordId, setResetPasswordId] = useState<number | null>(null)
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

  // Filter users based on search & filters
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

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchWithAuth("/api/users")
      if (!response.ok) {
        throw new Error(`status ${response.status}`)
      }
      setUsers((await response.json()) as ManagedUser[])
    } catch {
      toast.error(
        t("manager:users.loadFailed"),
      )
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const handleCreate = async (event: SyntheticEvent) => {
    event.preventDefault()

    if (!username || !password) {
      toast.error(
        t("manager:users.invalidInput"),
      )
      return
    }

    setCreating(true)
    try {
      const response = await fetchWithAuth("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      })

      if (!response.ok) {
        toast.error(
          (await parseErrorMessage(response)) ??
            t("manager:users.createFailed"),
        )
        return
      }

      toast.success(
        t("manager:users.created"),
      )
      setUsername("")
      setPassword("")
      setRole("user")
      setCopySourceId(null)
      setIsCreateDialogOpen(false)
      await loadUsers()
    } catch {
      toast.error(
        t("manager:users.networkError"),
      )
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (user: ManagedUser) => {
    setPendingId(user.id)
    try {
      const action = user.active ? "disable" : "enable"
      const response = await fetchWithAuth(`/api/users/${user.id}/${action}`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`status ${response.status}`)
      }

      toast.success(
        user.active
          ? t("manager:users.disabled")
          : t("manager:users.enabled"),
      )
      await loadUsers()
    } catch {
      toast.error(
        t("manager:users.toggleFailed"),
      )
    } finally {
      setPendingId(null)
    }
  }

  const handleResetPassword = async (user: ManagedUser) => {
    if (!resetNewPassword) {
      toast.error(
        t("manager:users.passwordRequired"),
      )
      return
    }

    setResettingPassword(true)
    try {
      const response = await fetchWithAuth(
        `/api/users/${user.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: resetNewPassword }),
        },
      )

      if (!response.ok) {
        throw new Error(`status ${response.status}`)
      }

      toast.success(
        t("manager:users.passwordReset"),
      )
      setResetPasswordId(null)
      setResetNewPassword("")
      await loadUsers()
    } catch {
      toast.error(
        t("manager:users.resetFailed"),
      )
    } finally {
      setResettingPassword(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete || deleting) return

    setDeleting(true)
    try {
      const response = await fetchWithAuth(`/api/users/${pendingDelete.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        toast.error(
          (await parseErrorMessage(response)) ??
            t("manager:users.deleteFailed"),
        )
        return
      }

      toast.success(
        t("manager:users.deleted", { name: pendingDelete.username }),
      )
      setPendingDelete(null)
      await loadUsers()
    } catch {
      toast.error(
        t("manager:users.toggleFailed"),
      )
    } finally {
      setDeleting(false)
    }
  }

  const handleBulkAction = async () => {
    if (!bulkAction || selection.selected.size === 0) return

    setBulkProcessing(true)
    try {
      const endpoint = `/api/users/bulk-${bulkAction}`
      const response = await fetchWithAuth(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selection.selected) }),
      })

      if (!response.ok) {
        throw new Error(`status ${response.status}`)
      }

      const result = (await response.json()) as BulkResponse

      // Build toast message with localized counts.
      // Server returns {succeeded, skipped (with reason), failed (with reason)}.
      // Note: skipped items with reason "self" or "last_admin" are handled server-side;
      // consider adding client-side warnings for self-protective scenarios in future.
      const parts: string[] = []

      if (result.succeeded.length > 0) {
        parts.push(
          t("manager:bulk.resultSucceeded", {
            count: result.succeeded.length,
          }),
        )
      }
      if (result.skipped.length > 0) {
        parts.push(
          t("manager:bulk.resultSkipped", {
            count: result.skipped.length,
          }),
        )
      }
      if (result.failed.length > 0) {
        parts.push(
          t("manager:bulk.resultFailed", {
            count: result.failed.length,
          }),
        )
      }

      const message = parts.length > 0
        ? parts.join(", ")
        : t("manager:bulk.resultCompleted")

      toast.success(message)

      selection.clear()
      setBulkConfirm(false)
      setBulkAction(null)
      await loadUsers()
    } catch {
      toast.error(
        t("manager:users.bulkFailed", {
          defaultValue: "Bulk-Aktion fehlgeschlagen",
        }),
      )
    } finally {
      setBulkProcessing(false)
    }
  }

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

  const getDeleteDescription = () => {
    if (!pendingDelete) return ""

    const baseDesc = t("manager:users.deleteConfirmDescription", { name: pendingDelete.username })

    if (pendingDelete.role === "lehrkraft") {
      const cascadeWarning = t("manager:users.deleteConfirmCascade")
      return `${baseDesc}\n\n${cascadeWarning}`
    }

    return baseDesc
  }

  const getBulkConfirmMessage = () => {
    if (!bulkAction) return ""

    const selectedNames = filteredUsers
      .filter((u) => selection.isSelected(u.id))
      .slice(0, 5)
      .map((u) => u.username)

    const extra = selection.selected.size > 5 ?
      ` ${t("manager:bulk.andNMore", { count: selection.selected.size - 5 })}` :
      ""

    const nameList = selectedNames.join(", ") + extra

    let actionDesc = ""
    if (bulkAction === "activate") {
      actionDesc = t("manager:users.enable")
    } else if (bulkAction === "deactivate") {
      actionDesc = t("manager:users.disable")
    } else if (bulkAction === "delete") {
      actionDesc = t("manager:users.delete")
    }

    return `${selection.selected.size} Benutzer ${actionDesc}: ${nameList}`
  }

  const openCopyDialog = (sourceUser: ManagedUser) => {
    // Protect against copying own account (data exposure risk)
    const isSelf =
      currentUsername != null && sourceUser.username === currentUsername
    if (isSelf) {
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
      <div className="flex flex-1 flex-col gap-4 pb-20">
        <PageHeader
          title={t("manager:users.title")}
          subtitle={t("manager:users.intro")}
        />

        {/* Filter bar */}
        <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-2)] p-4">
          <Input
            data-testid="users-search"
            type="text"
            placeholder={t("manager:users.searchPlaceholder", {
              defaultValue: "Nach Benutzername suchen...",
            })}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />

          <div className="flex flex-wrap gap-4">
            {/* Role filter group */}
            <FilterGroup label={t("manager:users.roleFilter")}>
              {[
                { value: "all" as const, label: t("manager:users.roleAll", { defaultValue: "Alle Rollen" }) },
                { value: "user" as const, label: t("manager:users.role.user") },
                { value: "lehrkraft" as const, label: t("manager:users.role.lehrkraft") },
                { value: "admin" as const, label: t("manager:users.role.admin") },
              ].map((pill) => (
                <FilterPill
                  key={pill.value}
                  selected={roleFilter === pill.value}
                  onClick={() => setRoleFilter(pill.value)}
                  label={pill.label}
                />
              ))}
            </FilterGroup>

            {/* Status filter group */}
            <FilterGroup label={t("manager:users.statusFilter")}>
              {[
                { value: "all" as const, label: t("manager:users.statusAll", { defaultValue: "Alle Status" }) },
                { value: "active" as const, label: t("manager:users.active") },
                { value: "inactive" as const, label: t("manager:users.disabledStatus") },
              ].map((pill) => (
                <FilterPill
                  key={`status-${pill.value}`}
                  selected={statusFilter === pill.value}
                  onClick={() => setStatusFilter(pill.value)}
                  label={pill.label}
                />
              ))}
            </FilterGroup>
          </div>
        </div>

        {/* Bulk action toolbar */}
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

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader className="h-16" />
          </div>
        ) : filteredUsers.length === 0 ? (
        users.length > 0 ? (
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
        ) : (
          <>
            {/* Select-all control */}
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

            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-0.5">
              {filteredUsers.map((user) => {
                const isSelf =
                  currentUsername != null && user.username === currentUsername
                const busy =
                  pendingId === user.id || resettingPassword || deleting || bulkProcessing

                const allActions: ListRowAction[] = [
                  {
                    key: "copy",
                    icon: Copy,
                    label: t("manager:users.copyUser"),
                    disabled: busy || isSelf,
                    title: isSelf
                      ? t("manager:users.cannot_copy_self", {
                          defaultValue: "Du kannst dein eigenes Konto nicht kopieren",
                        })
                      : t("manager:users.copyUser"),
                    onClick: () => openCopyDialog(user),
                    className: "max-sm:hidden",
                  },
                  {
                    key: "reset",
                    icon: Key,
                    label: t("manager:users.resetPassword"),
                    disabled: busy,
                    onClick: () => {
                      setResetPasswordId(user.id)
                      setResetNewPassword("")
                    },
                  },
                  {
                    key: "toggle",
                    icon: user.active ? Ban : CheckCircle2,
                    label: user.active
                      ? t("manager:users.disable")
                      : t("manager:users.enable"),
                    destructive: user.active,
                    disabled: busy || isSelf,
                    title: isSelf
                      ? user.active
                        ? t("manager:users.cannot_deactivate_self")
                        : t("manager:users.cannot_modify_own_account")
                      : undefined,
                    onClick: () => {
                      if (isSelf) return
                      void handleToggleActive(user)
                    },
                    className: "max-sm:hidden",
                  },
                  {
                    key: "delete",
                    icon: Trash2,
                    label: t("manager:users.delete"),
                    destructive: true,
                    disabled: busy || isSelf,
                    title: isSelf
                      ? t("manager:users.cannot_delete_self")
                      : undefined,
                    className: "max-sm:hidden",
                    onClick: () => {
                      if (isSelf) return
                      setPendingDelete({
                        id: user.id,
                        username: user.username,
                        role: user.role,
                      })
                    },
                  },
                ]

                return (
                  <ListRow
                    key={user.id}
                    selected={selection.isSelected(user.id)}
                    leading={
                      <UserCog className="size-5 shrink-0 text-[var(--ink-muted)]" />
                    }
                    selection={
                      <RowSelectionControl
                        checked={selection.isSelected(user.id)}
                        onChange={() => selection.toggle(user.id)}
                        ariaLabel={t("manager:users.selectUser", { name: user.username })}
                        data-testid={`user-select-${user.id}`}
                      />
                    }
                    title={user.username}
                    meta={
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge>{getRoleLabel(user.role)}</Badge>
                        <Badge tone={user.active ? "success" : "danger"}>
                          {user.active
                            ? t("manager:users.active")
                            : t("manager:users.disabledStatus")}
                        </Badge>
                      </span>
                    }
                    actions={allActions}
                    overflow={
                      <span className="sm:hidden">
                        <OverflowMenu actions={allActions.filter((a) => a.key === "copy" || a.key === "toggle" || a.key === "delete")} />
                      </span>
                    }
                  />
                )
              })}
            </div>
          </>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDelete(null)
            }
          }}
          title={t("manager:users.deleteConfirmTitle")}
          description={getDeleteDescription()}
          confirmLabel={t("manager:users.delete")}
          onConfirm={handleDelete}
        />

        {/* Reset Password Dialog */}
        <Dialog.Root
          open={resetPasswordId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setResetPasswordId(null)
              setResetNewPassword("")
            }
          }}
        >
          <Portal>
            <Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content
              aria-labelledby="reset-password-dialog-title"
              className="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-6 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <Dialog.Title
                  id="reset-password-dialog-title"
                  className="text-lg font-semibold text-[var(--ink)]"
                >
                  {t("manager:users.resetPasswordTitle")}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common:close")}
                  >
                    <X className="size-5" />
                  </Button>
                </Dialog.Close>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="reset-password-input"
                  className="mb-2 block text-sm font-semibold text-[var(--ink-muted)]"
                >
                  {t("manager:users.passwordLabel")}
                </label>
                <Input
                  id="reset-password-input"
                  type="password"
                  autoComplete="new-password"
                  value={resetNewPassword}
                  onChange={(event) => setResetNewPassword(event.target.value)}
                  disabled={resettingPassword}
                  className="w-full"
                  placeholder={t("manager:users.enterNewPassword")}
                />
              </div>

              <div className="mt-4 flex justify-end gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    setResetPasswordId(null)
                    setResetNewPassword("")
                  }}
                  disabled={resettingPassword}
                  className="bg-[var(--surface-4)] text-[var(--ink)] hover:bg-[var(--surface-5)]"
                >
                  {t("common:cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const user = users.find((u) => u.id === resetPasswordId)
                    if (user) {
                      void handleResetPassword(user)
                    }
                  }}
                  disabled={resettingPassword || !resetNewPassword}
                >
                  {resettingPassword
                    ? t("common:loading")
                    : t("common:confirm")}
                </Button>
              </div>
            </Dialog.Content>
          </Portal>
        </Dialog.Root>

        {/* Create/Copy User Dialog */}
        <Dialog.Root
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
        >
          <Portal>
            <Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content
              aria-labelledby="create-user-dialog-title"
              className="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-6 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <Dialog.Title
                  id="create-user-dialog-title"
                  className="text-lg font-semibold text-[var(--ink)]"
                >
                  {copySourceId
                    ? t("manager:users.copyDialogTitle")
                    : t("manager:users.createTitle")}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common:close")}
                  >
                    <X className="size-5" />
                  </Button>
                </Dialog.Close>
              </div>

              <form
                onSubmit={(event) => {
                  void handleCreate(event)
                }}
                className="mt-4 flex flex-col gap-3"
              >
                <div>
                  <label
                    htmlFor="new-user-username"
                    className="mb-1 block text-xs font-semibold text-[var(--ink-subtle)]"
                  >
                    {t("manager:users.usernameLabel")}
                  </label>
                  <Input
                    id="new-user-username"
                    autoComplete="off"
                    className="w-full"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    disabled={creating}
                    autoFocus
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-user-password"
                    className="mb-1 block text-xs font-semibold text-[var(--ink-subtle)]"
                  >
                    {t("manager:users.passwordLabel")}
                  </label>
                  <Input
                    id="new-user-password"
                    type="password"
                    autoComplete="new-password"
                    className="w-full"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={creating}
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-user-role"
                    className="mb-1 block text-xs font-semibold text-[var(--ink-subtle)]"
                  >
                    {t("manager:users.roleLabel")}
                  </label>
                  <Select
                    id="new-user-role"
                    value={role}
                    onChange={(event) => {
                      const val = event.target.value
                      if (
                        val === "admin" ||
                        val === "lehrkraft" ||
                        val === "user"
                      ) {
                        setRole(val)
                      }
                    }}
                    disabled={creating}
                  >
                    <option value="user">
                      {t("manager:users.role.user")}
                    </option>
                    <option value="admin">
                      {t("manager:users.role.admin")}
                    </option>
                    {config?.klassenEnabled && (
                      <option value="lehrkraft">
                        {t("manager:users.role.lehrkraft")}
                      </option>
                    )}
                  </Select>
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setIsCreateDialogOpen(false)
                      setCopySourceId(null)
                    }}
                    disabled={creating}
                  >
                    {t("common:cancel")}
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating
                      ? t("common:loading")
                      : t("manager:users.create")}
                  </Button>
                </div>
              </form>
            </Dialog.Content>
          </Portal>
        </Dialog.Root>

        {/* Bulk confirmation dialog */}
        <AlertDialog
          open={bulkConfirm}
          onOpenChange={(open) => {
            if (!open) {
              setBulkConfirm(false)
              setBulkAction(null)
            }
          }}
          title={
  bulkAction === "activate"
    ? t("manager:users.bulkConfirmTitleActivate", { count: selection.selected.size })
    : bulkAction === "deactivate"
      ? t("manager:users.bulkConfirmTitleDeactivate", { count: selection.selected.size })
      : t("manager:users.bulkConfirmTitleDelete", { count: selection.selected.size })
}
          description={getBulkConfirmMessage()}
          confirmLabel={
            bulkAction === "delete"
              ? t("manager:users.delete")
              : t("common:confirm")
          }
          onConfirm={handleBulkAction}
        />
      </div>

      <ActionFooter>
        <Button
          data-testid="user-create-btn"
          variant="primary"
          size="lg"
          className="w-full rounded-[var(--radius-theme)] sm:w-auto"
          onClick={() => {
            setCopySourceId(null)
            setUsername("")
            setPassword("")
            setRole("user")
            setIsCreateDialogOpen(true)
          }}
        >
          <UserPlus className="size-5" aria-hidden strokeWidth={2.5} />
          <span>
            {t("manager:users.createTitle")}
          </span>
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigUsers
