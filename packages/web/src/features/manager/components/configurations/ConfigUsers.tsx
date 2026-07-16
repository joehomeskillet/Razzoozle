import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Badge from "@razzoozle/web/components/manager/Badge"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import Loader from "@razzoozle/web/components/Loader"
import { fetchWithAuth } from "@razzoozle/web/lib/api"
import {
  EmptyState,
  ListRow,
  SectionCard,
} from "@razzoozle/web/features/manager/components/console"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { Ban, CheckCircle2, UserPlus, Users as UsersIcon, Key, Trash2 } from "lucide-react"
import { type SyntheticEvent, useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Admin-only teacher-account management (GET/POST /api/users, admin-gated on
// the server). Not a socket concern — the payload is a plain REST DTO local
// to this tab, so the shape lives here rather than in @razzoozle/common.
interface ManagedUser {
  id: number
  username: string
  role: string
  active: boolean
  created_at: string
}

const parseErrorMessage = async (response: Response): Promise<string | null> => {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === "object" && "error" in body) {
      const { error } = body as { error?: unknown }
      return typeof error === "string" ? error : null
    }
  } catch {
    // Non-JSON error body — fall back to the caller's generic message.
  }
  return null
}

const ConfigUsers = () => {
  const { t } = useTranslation()
  const config = useConfig()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"user" | "admin" | "lehrkraft">("user")
  const [creating, setCreating] = useState(false)
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
      const response = await fetchWithAuth(`/api/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetNewPassword }),
      })

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
    if (!pendingDelete) return

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
      defaultValue: "Nutzer {{name}} wird endgueltig geloescht und kann nicht rueckgaengig gemacht werden.",
    })

    if (pendingDelete.role === "lehrkraft") {
      const cascadeWarning = t("manager:users.deleteConfirmCascade", {
        defaultValue: "Alle Klassen und Schueler dieser Lehrkraft werden ebenfalls geloescht.",
      })
      return `${baseDesc}\n\n${cascadeWarning}`
    }

    return baseDesc
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ink)]">
          {t("manager:users.title", { defaultValue: "Nutzerverwaltung" })}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-subtle)]">
          {t("manager:users.intro", {
            defaultValue: "Lehrkräfte-Konten anlegen, sperren und freigeben.",
          })}
        </p>
      </div>

      <SectionCard
        icon={<UserPlus className="size-5" />}
        title={t("manager:users.createTitle", {
          defaultValue: "Neue Lehrkraft anlegen",
        })}
      >
        <form
          onSubmit={(event) => {
            void handleCreate(event)
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap"
        >
          <div className="min-w-40 flex-1">
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
            />
          </div>

          <div className="min-w-40 flex-1">
            <label
              htmlFor="new-user-password"
              className="mb-1 block text-xs font-semibold text-[var(--ink-subtle)]"
            >
              {t("manager:users.passwordLabel", { defaultValue: "Passwort" })}
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
            <select
              id="new-user-role"
              value={role}
              onChange={(event) => {
                const val = event.target.value
                if (val === "admin" || val === "lehrkraft" || val === "user") {
                  setRole(val)
                }
              }}
              disabled={creating}
              className="min-h-11 rounded-lg border-2 border-[var(--border-hairline)] px-3 font-semibold focus-visible:border-primary focus-visible:outline-none"
            >
              <option value="user">
                {t("manager:users.role.user", { defaultValue: "Nutzer" })}
              </option>
              <option value="admin">
                {t("manager:users.role.admin", { defaultValue: "Admin" })}
              </option>
              {config?.klassenEnabled && (
                <option value="lehrkraft">
                  {t("manager:users.role.lehrkraft", { defaultValue: "Lehrkraft" })}
                </option>
              )}
            </select>
          </div>

          <Button type="submit" disabled={creating} className="shrink-0">
            {creating
              ? t("common:loading", { defaultValue: "Wird geladen…" })
              : t("manager:users.create", { defaultValue: "Anlegen" })}
          </Button>
        </form>
      </SectionCard>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader className="h-16" />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          headline={t("manager:users.emptyHeadline", {
            defaultValue: "Noch keine Lehrkräfte",
          })}
          hint={t("manager:users.empty", {
            defaultValue: "Lege oben das erste Konto an.",
          })}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {users.map((user) => (
            <ListRow
              key={user.id}
              title={user.username}
              meta={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge>{getRoleLabel(user.role)}</Badge>
                  <span
                    className={
                      user.active
                        ? "inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700"
                        : "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700"
                    }
                  >
                    {user.active
                      ? t("manager:users.active", { defaultValue: "Aktiv" })
                      : t("manager:users.disabledStatus", {
                          defaultValue: "Deaktiviert",
                        })}
                  </span>
                </span>
              }
              actions={[
                {
                  key: "reset",
                  icon: Key,
                  label: t("manager:users.resetPassword", {
                    defaultValue: "Passwort zurücksetzen",
                  }),
                  disabled: pendingId === user.id || resettingPassword === true || deleting,
                  onClick: () => {
                    setResetPasswordId(user.id)
                    setResetNewPassword("")
                  },
                },
                {
                  key: "toggle",
                  icon: user.active ? Ban : CheckCircle2,
                  label: user.active
                    ? t("manager:users.disable", { defaultValue: "Deaktivieren" })
                    : t("manager:users.enable", { defaultValue: "Aktivieren" }),
                  destructive: user.active,
                  disabled: pendingId === user.id || resettingPassword === true || deleting,
                  onClick: () => {
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
                  disabled: pendingId === user.id || resettingPassword === true || deleting,
                  onClick: () => {
                    setPendingDelete({
                      id: user.id,
                      username: user.username,
                      role: user.role,
                    })
                  },
                },
              ]}
            />
          ))}
        </div>
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
      {resetPasswordId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-[var(--ink)]">
              {t("manager:users.resetPasswordTitle", {
                defaultValue: "Passwort zurücksetzen",
              })}
            </h3>
            <div className="mb-4">
              <label
                htmlFor="reset-password-input"
                className="mb-2 block text-sm font-semibold text-[var(--ink-muted)]"
              >
                {t("manager:users.passwordLabel", { defaultValue: "Passwort" })}
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
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                onClick={() => {
                  setResetPasswordId(null)
                  setResetNewPassword("")
                }}
                disabled={resettingPassword}
                className="bg-[var(--surface-4)] text-[var(--ink)] hover:bg-gray-300"
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
          </div>
        </div>
      )}
    </div>
  )
}

export default ConfigUsers
