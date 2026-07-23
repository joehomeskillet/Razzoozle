import { motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import Button from "@razzoozle/web/components/Button"

// ---------------------------------------------------------------------------
// Name entry screen
// ---------------------------------------------------------------------------

const USERNAME_MIN_LENGTH = 4

interface NameScreenProps {
  subject: string
  onStart: (name: string) => void
}

const NameScreen = ({ subject, onStart }: NameScreenProps) => {
  const [name, setName] = useState("")
  const [showError, setShowError] = useState(false)
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (name.trim().length < USERNAME_MIN_LENGTH) {
      setShowError(true)
      return
    }
    onStart(name.trim() || "Anonym")
  }

  const handleBlur = () => {
    if (name.trim().length < USERNAME_MIN_LENGTH) {
      setShowError(true)
    }
  }

  const handleInputChange = (value: string) => {
    setName(value)
    if (value.trim().length >= USERNAME_MIN_LENGTH) {
      setShowError(false)
    }
  }

  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center">
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={
          reduced
            ? { duration: 0.3 }
            : { type: "spring", stiffness: 300, damping: 30 }
        }
        className="relative z-10 mx-auto w-full max-w-md rounded-3xl border border-[var(--border-hairline)] bg-white p-10 shadow-lg"
      >
        <h1 className="mb-2 text-center text-4xl font-bold text-[color:var(--color-field-ink)]">
          {subject}
        </h1>
        <p className="mb-6 text-center text-lg text-[color:var(--color-field-ink)]/70">
          {t("game:solo.play")}
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <input
              type="text"
              minLength={USERNAME_MIN_LENGTH}
              maxLength={40}
              value={name}
              onChange={(e) => handleInputChange(e.target.value)}
              onBlur={handleBlur}
              placeholder={t("game:solo.enterName")}
              autoFocus
              autoComplete="off"
              aria-invalid={showError}
              aria-describedby={showError ? "name-error" : undefined}
              className="w-full bg-gray-50 border-2 border-[var(--border-hairline)] text-[color:var(--color-field-ink)] placeholder-gray-500 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/30 transition-all duration-300 rounded-2xl px-6 py-4 text-2xl text-center font-bold outline-none"
            />
            {showError && (
              <p id="name-error" className="text-sm font-medium text-[var(--state-error)]">
                {t("game:usernameRequired")}
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
          >
            {t("game:startGame")}
          </Button>
        </form>
      </motion.div>
    </section>
  )
}

export default NameScreen
