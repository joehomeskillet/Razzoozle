import { EVENTS } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
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
      className="z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-gray-50 shadow-lg"
    >
      {/* Branded header band — mirrors ConsoleShell's accent-tinted header. */}
      <header className="flex items-center gap-3 border-b border-gray-200 bg-gradient-to-r from-[var(--accent-tint)] to-white px-5 py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-tint)] text-[var(--color-primary)]">
          <Lock className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-gray-900">
            {t("manager:auth.title")}
          </p>
          <p className="text-sm text-gray-500">
            {t("manager:auth.subtitle")}
          </p>
        </div>
      </header>

      <form className="p-5" onSubmit={handleSubmit}>
        <label htmlFor="manager-password" className="sr-only">
          {t("manager:aria.passwordLabel")}
        </label>
        <Input
          id="manager-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          className="w-full"
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("manager:passwordPlaceholder")}
        />
        <Button className="mt-4 w-full" type="submit">
          {t("common:submit")}
        </Button>
      </form>
    </motion.div>
  )
}

export default ManagerPassword
