import { EVENTS } from "@razzoozle/common/constants"
import Button from "@razzoozle/web/components/Button"
import Card from "@razzoozle/web/components/Card"
import Input from "@razzoozle/web/components/Input"
import { useEvent } from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { Lock } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type SyntheticEvent, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  onSubmit: (_username: string, _password: string) => void
}

const ManagerPassword = ({ onSubmit }: Props) => {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const { setToken, setRole, setUsername: setStoreUsername } = useManagerStore()

  const handleSubmit = async (event: SyntheticEvent) => {
    event.preventDefault()

    if (!username || !password) {
      toast.error(t("manager:auth.invalidInput", {
        defaultValue: "Benutzername und Passwort erforderlich",
      }))
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          toast.error(t("manager:auth.invalidCredentials", {
            defaultValue: "Benutzername oder Passwort falsch",
          }))
        } else {
          toast.error(t("manager:auth.error", {
            defaultValue: "Authentifizierung fehlgeschlagen",
          }))
        }
        setIsLoading(false)
        return
      }

      const data = await response.json() as { token: string; role: "admin" | "user"; username: string }
      setToken(data.token)
      setRole(data.role)
      setStoreUsername(data.username)

      // Call the provided callback for further routing
      onSubmit(username, password)
    } catch (error) {
      console.error("Login error:", error)
      toast.error(t("manager:auth.networkError", {
        defaultValue: "Verbindungsfehler",
      }))
    } finally {
      setIsLoading(false)
    }
  }

  useEvent(EVENTS.MANAGER.ERROR_MESSAGE, (message) => {
    toast.error(t(message))
  })

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={reducedMotion ? undefined : { duration: 0.32, ease: "easeOut" }}
      className="z-10 w-full max-w-sm"
    >
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-tint)] text-[var(--color-primary)]">
            <Lock className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[color:var(--color-field-ink)]">
              {t("manager:auth.title")}
            </h1>
            <p className="text-sm text-[color:var(--color-field-ink)]/60">
              {t("manager:auth.subtitle")}
            </p>
          </div>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="manager-username" className="sr-only">
              {t("manager:auth.usernameLabel")}
            </label>
            <Input
              data-testid="login-username"
              id="manager-username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              className="w-full"
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("manager:auth.usernamePlaceholder", {
                defaultValue: "Benutzername",
              })}
              disabled={isLoading}
              value={username}
            />
          </div>

          <div>
            <label htmlFor="manager-password" className="sr-only">
              {t("manager:auth.passwordLabel")}
            </label>
            <Input
              data-testid="login-password"
              id="manager-password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="w-full"
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("manager:passwordPlaceholder")}
              disabled={isLoading}
              value={password}
            />
          </div>

          <Button
            data-testid="login-submit"
            className="mt-4 w-full"
            type="submit"
            disabled={isLoading}
          >
            {isLoading
              ? t("common:loading", { defaultValue: "Wird geladen…" })
              : t("common:submit")}
          </Button>
        </form>
      </Card>
    </motion.div>
  )
}

export default ManagerPassword
