import { getTemplate } from "@razzoozle/web/lib/templatesApi"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import Loader from "@razzoozle/web/components/Loader"
import QuizzEditorShell from "@razzoozle/web/features/quizz/components/QuizzEditorShell"
import { QuizzEditorProvider } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import EmptyState from "@razzoozle/web/features/manager/components/console/EmptyState"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"

const TemplateEditPage = () => {
  const { templateId } = Route.useParams()
  const navigate = useNavigate()
  const { role } = useManagerStore()
  const { t } = useTranslation("manager")

  const [template, setTemplate] = useState<
    Awaited<ReturnType<typeof getTemplate>> | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Redirect non-admins to config quiz tab
  useEffect(() => {
    if (role !== null && role !== "admin") {
      navigate({ to: "/manager/config/$tab", params: { tab: "quiz" } })
    }
  }, [role, navigate])

  // Load template
  useEffect(() => {
    // Don't load if not admin or still checking role
    if (role === null || role !== "admin") {
      return
    }

    setIsLoading(true)
    setError(null)

    getTemplate(templateId)
      .then((data) => {
        setTemplate(data)
        setIsLoading(false)
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : t("templates.loadError"),
        )
        setIsLoading(false)
      })
  }, [templateId, role, t])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-svh items-center justify-center bg-[var(--surface)]">
        <Loader className="text-[var(--ink-muted)] max-h-23" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-svh items-center justify-center bg-[var(--surface)] p-4">
        <EmptyState
          icon={AlertCircle}
          headline={t("templates.loadError")}
          hint={error}
          action={{
            label: t("manager:common.back"),
            onClick: () => navigate({ to: "/manager/config/$tab", params: { tab: "quiz" } }),
          }}
        />
      </div>
    )
  }

  // Success state
  if (template) {
    return (
      <QuizzEditorProvider
        initialData={{
          id: template.id,
          subject: template.name,
          questions: template.questions,
        }}
      >
        <QuizzEditorShell />
      </QuizzEditorProvider>
    )
  }

  // Fallback (shouldn't reach here)
  return null
}

export const Route = createFileRoute("/manager/template/$templateId")({
  component: TemplateEditPage,
})
