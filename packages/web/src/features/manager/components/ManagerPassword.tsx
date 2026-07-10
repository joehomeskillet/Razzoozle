import { EVENTS } from "@razzoozle/common/constants"
import Button from "@razzoozle/web/components/Button"
import Card from "@razzoozle/web/components/Card"
import Input from "@razzoozle/web/components/Input"
import { useEvent } from "@razzoozle/web/features/game/contexts/socket-context"
import { Lock } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type SyntheticEvent, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  onSubmit: (_password: string) => void
}

const ManagerPassword = ({ onSubmit }: Props) => {
  const [password, setPassword] = useState("")
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault()
    onSubmit(password)
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

        <form className="mt-4" onSubmit={handleSubmit}>
          <label htmlFor="manager-password" className="sr-only">
            {t("manager:aria.passwordLabel")}
          </label>
          <Input
            data-testid="login-password"
            id="manager-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            className="w-full"
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("manager:passwordPlaceholder")}
          />
          <Button data-testid="login-submit" className="mt-4 w-full" type="submit">
            {t("common:submit")}
          </Button>
        </form>
      </Card>
    </motion.div>
  )
}

export default ManagerPassword
