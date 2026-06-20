/**
 * CreateAssignmentModal — manager-facing form to create an assignment
 * with deadline, max attempts, and identifier requirements.
 *
 * POSTs to /api/assignment with manager auth header (X-Manager-Token).
 */
import { getClientId } from "@razzoozle/web/features/game/contexts/socket-context"
import { Copy, X } from "lucide-react"
import { useReducedMotion, motion } from "motion/react"
import { useCallback, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface CreateAssignmentModalProps {
  quizzId: string
  quizzTitle?: string
  onClose: () => void
  onSuccess?: (assignmentId: string) => void
}

interface FormData {
  deadline: string
  maxAttempts: string
  requireIdentifier: boolean
  showCorrectAnswers: boolean
}

const MANAGER_TOKEN_HEADER = "X-Manager-Token"

const CreateAssignmentModal = ({
  quizzId,
  quizzTitle,
  onClose,
  onSuccess,
}: CreateAssignmentModalProps) => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const managerToken = getClientId()

  const [formData, setFormData] = useState<FormData>({
    deadline: "",
    maxAttempts: "",
    requireIdentifier: false,
    showCorrectAnswers: true,
  })

  const [loading, setLoading] = useState(false)
  const [createdAssignmentId, setCreatedAssignmentId] = useState<string | null>(
    null,
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setLoading(true)

      try {
        const body: Record<string, unknown> = {
          quizzId,
          requireIdentifier: formData.requireIdentifier,
          showCorrectAnswers: formData.showCorrectAnswers,
        }

        if (formData.deadline) {
          const deadlineMs = new Date(formData.deadline).getTime()
          if (deadlineMs <= Date.now()) {
            toast.error(
              t("assignment:error.deadlineInPast", {
                defaultValue: "Deadline darf nicht in der Vergangenheit liegen",
              }),
            )
            setLoading(false)
            return
          }
          body.deadline = deadlineMs
        }

        if (formData.maxAttempts) {
          const attempts = parseInt(formData.maxAttempts, 10)
          if (attempts < 1) {
            toast.error(
              t("assignment:error.attemptsMin", {
                defaultValue: "Mindestens 1 Versuch erforderlich",
              }),
            )
            setLoading(false)
            return
          }
          body.maxAttempts = attempts
        }

        const res = await fetch("/api/assignment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [MANAGER_TOKEN_HEADER]: managerToken,
          },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          const errorMessage =
            (errorData as { error?: string }).error || `Fehler ${res.status}`
          toast.error(
            t("assignment:error.creationFailed", {
              defaultValue: "Aufgabe konnte nicht erstellt werden",
            }),
          )
          console.error("Assignment creation failed:", errorMessage)
          setLoading(false)
          return
        }

        const data = (await res.json()) as { id: string }
        setCreatedAssignmentId(data.id)
        onSuccess?.(data.id)

        toast.success(
          t("assignment:success.created", {
            defaultValue: "Aufgabe erstellt",
          }),
        )
      } catch (err) {
        console.error("Assignment creation error:", err)
        toast.error(
          t("assignment:error.network", {
            defaultValue: "Netzwerkfehler",
          }),
        )
      } finally {
        setLoading(false)
      }
    },
    [quizzId, formData, managerToken, t, onSuccess],
  )

  const playerLink = createdAssignmentId
    ? `${window.location.origin}/quizz/${encodeURIComponent(quizzId)}/assignment/${encodeURIComponent(createdAssignmentId)}`
    : null

  const handleCopyLink = useCallback(() => {
    if (playerLink) {
      navigator.clipboard.writeText(playerLink).then(() => {
        toast.success(
          t("common:copied", {
            defaultValue: "In die Zwischenablage kopiert",
          }),
        )
      })
    }
  }, [playerLink, t])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div
        initial={
          reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.9, y: 20 }
        }
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
        transition={reducedMotion ? { duration: 0.2 } : { duration: 0.3 }}
        className="relative w-full max-w-md rounded-2xl border border-[var(--border-hairline)] bg-white p-6 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-[color:var(--color-field-ink)]">
              {t("assignment:create.title", { defaultValue: "Neue Aufgabe" })}
            </h2>
            {quizzTitle && (
              <p className="mt-1 text-sm text-[color:var(--color-field-ink)]/60">
                {quizzTitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common:close", { defaultValue: "Schließen" })}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[color:var(--color-field-ink)]/60 hover:bg-gray-100 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {!createdAssignmentId ? (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {/* Deadline */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="deadline"
                className="text-sm font-semibold text-[color:var(--color-field-ink)]"
              >
                {t("assignment:form.deadline", {
                  defaultValue: "Abgabefrist (optional)",
                })}
              </label>
              <input
                id="deadline"
                type="datetime-local"
                value={formData.deadline}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    deadline: e.target.value,
                  }))
                }
                className="rounded-lg border border-[var(--border-hairline)] bg-gray-50 px-4 py-2 text-[color:var(--color-field-ink)] focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>

            {/* Max Attempts */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="maxAttempts"
                className="text-sm font-semibold text-[color:var(--color-field-ink)]"
              >
                {t("assignment:form.maxAttempts", {
                  defaultValue: "Maximale Versuche (optional)",
                })}
              </label>
              <input
                id="maxAttempts"
                type="number"
                min="1"
                value={formData.maxAttempts}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    maxAttempts: e.target.value,
                  }))
                }
                placeholder="Unbegrenzt"
                className="rounded-lg border border-[var(--border-hairline)] bg-gray-50 px-4 py-2 text-[color:var(--color-field-ink)] placeholder-gray-500 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>

            {/* Require Identifier */}
            <div className="flex items-center gap-3">
              <input
                id="requireIdentifier"
                type="checkbox"
                checked={formData.requireIdentifier}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    requireIdentifier: e.target.checked,
                  }))
                }
                className="size-5 rounded border-[var(--border-hairline)] text-primary focus:ring-2 focus:ring-primary/30"
              />
              <label
                htmlFor="requireIdentifier"
                className="text-sm font-medium text-[color:var(--color-field-ink)]"
              >
                {t("assignment:form.requireIdentifier", {
                  defaultValue: "Identifikation erforderlich",
                })}
              </label>
            </div>

            {/* Show Correct Answers */}
            <div className="flex items-center gap-3">
              <input
                id="showCorrectAnswers"
                type="checkbox"
                checked={formData.showCorrectAnswers}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    showCorrectAnswers: e.target.checked,
                  }))
                }
                className="size-5 rounded border-[var(--border-hairline)] text-primary focus:ring-2 focus:ring-primary/30"
              />
              <label
                htmlFor="showCorrectAnswers"
                className="text-sm font-medium text-[color:var(--color-field-ink)]"
              >
                {t("assignment:form.showCorrectAnswers", {
                  defaultValue: "Richtige Antworten anzeigen",
                })}
              </label>
            </div>

            {/* Buttons */}
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-white px-4 py-2 font-semibold text-[color:var(--color-field-ink)] hover:bg-gray-50 transition-colors"
              >
                {t("common:cancel", { defaultValue: "Abbrechen" })}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-gradient-to-r from-primary to-purple-500 px-4 py-2 font-semibold text-white shadow-md shadow-primary/30 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? t("common:loading", { defaultValue: "Lädt..." })
                  : t("assignment:create.submit", { defaultValue: "Erstellen" })}
              </button>
            </div>
          </form>
        ) : (
          /* Success screen with shareable link */
          <div className="mt-6 flex flex-col gap-4">
            <div className="rounded-lg bg-green-50 p-4 text-center">
              <p className="text-sm font-semibold text-green-700">
                {t("assignment:success.created", {
                  defaultValue: "Aufgabe erfolgreich erstellt!",
                })}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-[color:var(--color-field-ink)]">
                {t("assignment:success.shareLink", {
                  defaultValue: "Link zum Teilen",
                })}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={playerLink || ""}
                  className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-gray-50 px-4 py-2 text-sm text-[color:var(--color-field-ink)] focus:bg-white focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  title={t("common:copy", { defaultValue: "Kopieren" })}
                  className="rounded-lg bg-gray-100 p-2 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <Copy className="size-5" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gradient-to-r from-primary to-purple-500 px-4 py-2 font-semibold text-white shadow-md shadow-primary/30 hover:brightness-110 active:scale-95 transition-all"
            >
              {t("common:done", { defaultValue: "Fertig" })}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}

export default CreateAssignmentModal
