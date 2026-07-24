import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

type TemplateMeta = {
  id: string
  category: string
  name: string
  description: string
  tags: string[]
  questionCount: number
}

export function TemplateLibraryCard() {
  const { t } = useTranslation()
  const [items, setItems] = useState<TemplateMeta[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: TemplateMeta[]) => setItems(data))
      .catch((e) => setError(String(e)))
  }, [])

  const createFrom = async (templateId: string) => {
    const res = await fetch("/api/templates/create-from", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
    })
    if (!res.ok) {
      setError(`create failed: ${res.status}`)
      return
    }
    const quiz = (await res.json()) as { id?: string }
    if (quiz.id) {
      window.location.href = `/manager/quizz/${quiz.id}`
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm" data-testid="template-library">
      <h2 className="text-base font-semibold">
        {t("manager:templates.title", { defaultValue: "Templates" })}
      </h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((tpl) => (
          <li
            key={tpl.id}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
          >
            <div>
              <p className="font-medium">{tpl.name}</p>
              <p className="text-xs text-gray-500">
                {tpl.category} · {tpl.questionCount} Q
              </p>
            </div>
            <button
              type="button"
              className="min-h-10 rounded-md bg-[var(--color-primary)] px-3 text-sm text-white"
              onClick={() => void createFrom(tpl.id)}
              data-testid={`template-use-${tpl.id}`}
            >
              {t("manager:templates.use", { defaultValue: "Use" })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default TemplateLibraryCard
