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
import { useManagerStore } from "@razzoozle/web/game/stores/manager"
import { useEntitySelection } from "@razzoozle/web/features/manager/hooks/useEntitySelection"
import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
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

  // Filter users based on search & filters
  
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
        t("manager:users.loadFailed", {
          defaultValue: "Nutzer konnten nicht geladen werden",
        }),
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
        t("manager:users.invalidInput", {
          defaultValue: "Benutzername und Passwort erforderlich",
        }),
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
            t("manager:users.createFailed", {
              defaultValue: "Anlegen fehlgeschlagen",
            }),
        )
        return
      }

      toast.success(
        t("manager:users.created", { defaultValue: "Nutzer angelegt" }),
      )
      setUsername("")
      setPassword("")
      setRole("user")
      setCopySourceId(null)
      setIsCreateDialogOpen(false)
      await loadUsers()
    } catch {
      toast.error(
        t("manager:users.networkError", { defaultValue: "Verbindungsfehler" }),
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
          ? t("manager:users.disabled", { defaultValue: "Nutzer deaktiviert" })
          : t("manager:users.enabled", { defaultValue: "Nutzer aktiviert" }),
      )
      await loadUsers()
    } catch {
      toast.error(
        t("manager:users.toggleFailed", {
          defaultValue: "Aktion fehlgeschlagen",
        }),
      )
    } finally {
      setPendingId(null)
    }
  }

  const handleResetPassword = async (user: ManagedUser) => {
    if (!resetNewPassword) {
      toast.error(
        t("manager:users.passwordRequired", {
          defaultValue: "Passwort erforderlich",
        }),
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
        t("manager:users.passwordReset", {
          defaultValue: "Passwort zurückgesetzt",
        }),
      )
      setResetPasswordId(null)
      setResetNewPassword("")
      await loadUsers()
    } catch {
      toast.error(
        t("manager:users.resetFailed", {
          defaultValue: "Zurücksetzen fehlgeschlagen",
        }),
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
            t("manager:users.deleteFailed", {
              defaultValue: "Löschen fehlgeschlagen",
            }),
        )
        return
      }

      toast.success(
        t("manager:users.deleted", {
          name: pendingDelete.username,
          defaultValue: "Nutzer {{name}} gelöscht",
        }),
      )
      setPendingDelete(null)
      await loadUsers()
    } catch {
      toast.error(
        t("manager:users.toggleFailed", {
          defaultValue: "Aktion fehlgeschlagen",
        }),
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
        return t("manager:users.role.admin", { defaultValue: "Admin" })
      case "lehrkraft":
        return t("manager:users.role.lehrkraft", { defaultValue: "Lehrkraft" })
      case "user":
      default:
        return t("manager:users.role.user", { defaultValue: "Nutzer" })
    }
  }

  const getDeleteDescription = () => {
    if (!pendingDelete) return ""

    const baseDesc = t("manager:users.deleteConfirmDescription", {
      name: pendingDelete.username,
      defaultValue:
        "Nutzer {{name}} wird endgültig gelöscht und kann nicht rückgängig gemacht werden.",
    })

    if (pendingDelete.role === "lehrkraft") {
      const cascadeWarning = t("manager:users.deleteConfirmCascade", {
        defaultValue:
          "Alle Klassen und Schüler dieser Lehrkraft werden ebenfalls gelöscht.",
      })
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
      ` ${t("manager:bulk.andNMore", { count: selection.selected.size - 5, defaultValue: "und {{count}} weitere" })}` :
      ""

    const nameList = selectedNames.join(", ") + extra

    let actionDesc = ""
    if (bulkAction === "activate") {
      actionDesc = t("manager:users.enable", { defaultValue: "aktivieren" })
    } else if (bulkAction === "deactivate") {
      actionDesc = t("manager:users.disable", { defaultValue: "deaktivieren" })
    } else if (bulkAction === "delete") {
      actionDesc = t("manager:users.delete", { defaultValue: "löschen" })
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
          title={t("manager:users.title", {
            defaultValue: "Nutzerverwaltung",
          })}
          subtitle={t("manager:users.intro", {
            defaultValue: "Lehrkräfte-Konten anlegen, sperren und freigeben.",
          })}
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

          <div className="flex flex-wrap gap-2">
            {/* Role filter pills */}
            {[
              { value: "all" as const, label: t("manager:users.roleAll", { defaultValue: "Alle Rollen" }) },
              { value: "user" as const, label: t("manager:users.role.user", { defaultValue: "Nutzer" }) },
              { value: "lehrkraft" as const, label: t("manager:users.role.lehrkraft", { defaultValue: "Lehrkraft" }) },
              { value: "admin" as const, label: t("manager:users.role.admin", { defaultValue: "Admin" }) },
            ].map((pill) => (
              <button
                key={pill.value}
                onClick={() => setRoleFilter(pill.value)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  roleFilter === pill.value
                    ? "bg-[var(--accent)] text-[var(--surface)]"
                    : "bg-[var(--surface-4)] text-[var(--ink)] hover:bg-[var(--surface-5)]"
                }`}
              >
                {pill.label}
              </button>
            ))}

            {/* Status filter pills */}
            {[
              { value: "all" as const, label: t("manager:users.statusAll", { defaultValue: "Alle Status" }) },
              { value: "active" as const, label: t("manager:users.active", { defaultValue: "Aktiv" }) },
              { value: "inactive" as const, label: t("manager:users.disabledStatus", { defaultValue: "Deaktiviert" }) },
            ].map((pill) => (
              <button
                key={`status-${pill.value}`}
                onClick={() => setStatusFilter(pill.value)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  statusFilter === pill.value
                    ? "bg-[var(--accent)] text-[var(--surface)]"
                    : "bg-[var(--surface-4)] text-[var(--ink)] hover:bg-[var(--surface-5)]"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader className="h-16" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            headline={t("manager:users.emptyHeadline", {
              defaultValue: "Noch keine Nutzer",
            })}
            hint={t("manager:users.empty", {
              defaultValue: "Lege oben das erste Konto an.",
            })}
          />
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-0.5">
            {/* Select-all checkbox header (optional visual) */}
            <div className="text-xs font-semibold text-[var(--ink-muted)] px-3">
              <input
                data-testid="users-select-all"
                type="checkbox"
                ref={(el) => {
                  if (el) {
                    el.indeterminate =
                      selection.someSelected && !selection.allSelected
                    el.checked = selection.allSelected
                  }
                }}
                onChange={() => selection.toggleAll()}
                className="mr-2"
                aria-label="Alle auswählen"
              />
              {selection.selectionActive && (
                <span className="text-sm">
                  {selection.selected.size} von {filteredUsers.length} ausgewählt
                </span>
              )}
            </div>

            {filteredUsers.map((user) => {
              const isSelf =
                currentUsername != null && user.username === currentUsername
              const busy =
                pendingId === user.id || resettingPassword || deleting || bulkProcessing

              const allActions: ListRowAction[] = [
                {
                  key: "copy",
                  icon: Copy,
                  label: t("manager:users.copyUser", {
                    defaultValue: "Benutzer kopieren",
                  }),
                  disabled: busy || isSelf,
                  title: isSelf
                    ? t("manager:users.cannot_copy_self", {
                        defaultValue: "Du kannst dein eigenes Konto nicht kopieren",
                      })
                    : t("manager:users.copyUser", {
                        defaultValue: "Benutzer kopieren",
                      }),
                  onClick: () => openCopyDialog(user),
                },
                {
                  key: "reset",
                  icon: Key,
                  label: t("manager:users.resetPassword", {
                    defaultValue: "Passwort zurücksetzen",
                  }),
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
                    ? t("manager:users.disable", {
                        defaultValue: "Deaktivieren",
                      })
                    : t("manager:users.enable", { defaultValue: "Aktivieren" }),
                  destructive: user.active,
                  disabled: busy || isSelf,
                  title: isSelf
                    ? user.active
                      ? t("manager:users.cannot_deactivate_self", {
                          defaultValue:
                            "Dein Konto kann nicht deaktiviert werden",
                        })
                      : t("manager:users.cannot_modify_own_account", {
                          defaultValue:
                            "Du kannst dein eigenes Konto nicht ändern",
                        })
                    : undefined,
                  onClick: () => {
                    if (isSelf) return
                    void handleToggleActive(user)
                  },
                },
                {
                  key: "delete",
                  icon: Trash2,
                  label: t("manager:users.delete", {
                    defaultValue: "Löschen",
                  }),
                  destructive: true,
                  disabled: busy || isSelf,
                  title: isSelf
                    ? t("manager:users.cannot_delete_self", {
                        defaultValue: "Dein Konto kann nicht gelöscht werden",
                      })
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
                  leading={
                    <>
                      <input
                        data-testid={`user-select-${user.id}`}
                        type="checkbox"
                        checked={selection.isSelected(user.id)}
                        onChange={() => selection.toggle(user.id)}
                        className="mr-2"
                        aria-label={`Auswahl: ${user.username}`}
                      />
                      <UserCog className="size-5 shrink-0 text-[var(--ink-muted)]" />
                    </>
                  }
                  title={user.username}
                  meta={
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge>{getRoleLabel(user.role)}</Badge>
                      <Badge tone={user.active ? "success" : "danger"}>
                        {user.active
                          ? t("manager:users.active", { defaultValue: "Aktiv" })
                          : t("manager:users.disabledStatus", {
                              defaultValue: "Deaktiviert",
                            })}
                      </Badge>
                    </span>
                  }
                  actions={allActions}
                  overflow={
                    <span className="sm:hidden">
                      <OverflowMenu actions={allActions.filter((a) => a.key === "delete")} />
                    </span>
                  }
                />
              )
            })}
          </div>
        )}

        {/* Bulk action toolbar */}
        {selection.selectionActive && (
          <BulkActionToolbar
            count={selection.selected.size}
            label={t("manager:bulk.selected", {
              count: selection.selected.size,
              defaultValue: "{{count}} ausgewählt",
            })}
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
              {t("manager:users.enable", { defaultValue: "Aktivieren" })}
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
              {t("manager:users.disable", { defaultValue: "Deaktivieren" })}
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
              {t("manager:users.delete", { defaultValue: "Löschen" })}
            </Button>
          </BulkActionToolbar>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDelete(null)
            }
          }}
          title={t("manager:users.deleteConfirmTitle", {
            defaultValue: "Benutzer löschen?",
          })}
          description={getDeleteDescription()}
          confirmLabel={t("manager:users.delete", {
            defaultValue: "Löschen",
          })}
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
                  {t("manager:users.resetPasswordTitle", {
                    defaultValue: "Passwort zurücksetzen",
                  })}
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
                  {t("manager:users.passwordLabel", {
                    defaultValue: "Passwort",
                  })}
                </label>
                <Input
                  id="reset-password-input"
                  type="password"
                  autoComplete="new-password"
                  value={resetNewPassword}
                  onChange={(event) => setResetNewPassword(event.target.value)}
                  disabled={resettingPassword}
                  className="w-full"
                  placeholder={t("manager:users.enterNewPassword", {
                    defaultValue: "Neues Passwort eingeben",
                  })}
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
                  {t("common:cancel", { defaultValue: "Abbrechen" })}
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
                    ? t("common:loading", { defaultValue: "Wird geladen…" })
                    : t("common:confirm", { defaultValue: "Bestätigen" })}
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
                    ? t("manager:users.copyDialogTitle", {
                        defaultValue: "Benutzer kopieren",
                      })
                    : t("manager:users.createTitle", {
                        defaultValue: "Neuen Benutzer anlegen",
                      })}
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
                    {t("manager:users.usernameLabel", {
                      defaultValue: "Benutzername",
                    })}
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
                    {t("manager:users.passwordLabel", {
                      defaultValue: "Passwort",
                    })}
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
                    {t("manager:users.roleLabel", { defaultValue: "Rolle" })}
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
                      {t("manager:users.role.user", { defaultValue: "Nutzer" })}
                    </option>
                    <option value="admin">
                      {t("manager:users.role.admin", { defaultValue: "Admin" })}
                    </option>
                    {config?.klassenEnabled && (
                      <option value="lehrkraft">
                        {t("manager:users.role.lehrkraft", {
                          defaultValue: "Lehrkraft",
                        })}
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
                      ? t("common:loading", { defaultValue: "Wird geladen…" })
                      : t("manager:users.create", { defaultValue: "Erstellen" })}
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
          title={`${selection.selected.size} Benutzer ${bulkAction}?`}
          description={getBulkConfirmMessage()}
          confirmLabel={
            bulkAction === "delete"
              ? t("manager:users.delete", { defaultValue: "Löschen" })
              : t("common:confirm", { defaultValue: "Bestätigen" })
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
            {t("manager:users.createTitle", {
              defaultValue: "Neuen Benutzer anlegen",
            })}
          </span>
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigUsers
