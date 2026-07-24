/**
 * /quizz/:id/study — free-paced review with answers visible (no scoring).
 */
import Loader from "@razzoozle/web/components/Loader"
import QuestionMedia from "@razzoozle/web/components/QuestionMedia"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

type StudyQuestion = {
  question: string
  type?: string
  answers?: string[]
  solutions?: number[]
  correct?: number
  acceptedAnswers?: string[]
  chunks?: string[]
  media?: { type?: "image" | "video" | "audio"; url: string }
  explanation?: string
}

const StudyPage = () => {
  const { id } = useParams({ from: "/quizz/$id/study" })
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [subject, setSubject] = useState("")
  const [questions, setQuestions] = useState<StudyQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/quizz/${id}/study`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          subject: string
          questions: StudyQuestion[]
        }
        if (!cancelled) {
          setSubject(data.subject)
          setQuestions(data.questions ?? [])
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "load failed")
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <Loader />
  if (error) {
    return (
      <div className="p-6 text-center text-red-600" data-testid="study-error">
        {error}
      </div>
    )
  }
  const q = questions[index]
  if (!q) {
    return (
      <div className="p-6 text-center" data-testid="study-empty">
        {t("game:study.empty", { defaultValue: "No questions" })}
      </div>
    )
  }

  const correctLabels = (() => {
    if (q.answers && q.solutions) {
      return q.solutions
        .map((i) => q.answers?.[i])
        .filter(Boolean)
        .join(", ")
    }
    if (q.acceptedAnswers?.length) return q.acceptedAnswers.join(" / ")
    if (q.correct != null) return String(q.correct)
    if (q.chunks?.length) return q.chunks.join(" ")
    return t("game:study.noExplanation", {
      defaultValue: "See question payload",
    })
  })()

  return (
    <div
      className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-4"
      data-testid="study-page"
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--game-fg)]/60">
            {t("game:study.badge", { defaultValue: "Study" })}
          </p>
          <h1 className="text-lg font-bold">{subject}</h1>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-lg border px-3 text-sm"
          onClick={() => void navigate({ to: "/" as never })}
        >
          {t("common:back", { defaultValue: "Home" })}
        </button>
      </header>

      <p className="text-sm text-[color:var(--game-fg)]/70" data-testid="study-progress">
        {t("game:study.progress", {
          defaultValue: "Question {{n}} of {{total}}",
          n: index + 1,
          total: questions.length,
        })}
      </p>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold" data-testid="study-question">
          {q.question}
        </h2>
        {q.media?.url && (
          <div className="mt-3">
            <QuestionMedia media={q.media as never} />
          </div>
        )}
        {q.answers && (
          <ul className="mt-4 flex flex-col gap-2">
            {q.answers.map((a, i) => {
              const ok = q.solutions?.includes(i)
              return (
                <li
                  key={i}
                  className={
                    ok
                      ? "rounded-lg border border-green-500 bg-green-50 px-3 py-2"
                      : "rounded-lg border px-3 py-2"
                  }
                  data-testid={`study-answer-${i}`}
                >
                  {a}
                </li>
              )
            })}
          </ul>
        )}
        <div className="mt-4 rounded-lg bg-[var(--color-primary)]/10 p-3 text-sm">
          <p className="font-semibold">
            {t("game:study.correctAnswer", { defaultValue: "Correct answer" })}
          </p>
          <p data-testid="study-correct">{correctLabels}</p>
          <p className="mt-2 text-[color:var(--game-fg)]/70">
            {q.explanation ??
              t("game:study.noExplanation", {
                defaultValue: "No explanation available",
              })}
          </p>
        </div>
      </section>

      <footer className="mt-auto flex gap-2">
        <button
          type="button"
          disabled={index <= 0}
          className="min-h-12 flex-1 rounded-xl border disabled:opacity-40"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          data-testid="study-prev"
        >
          {t("game:study.prev", { defaultValue: "Previous" })}
        </button>
        <button
          type="button"
          disabled={index >= questions.length - 1}
          className="min-h-12 flex-1 rounded-xl bg-[var(--color-primary)] text-white disabled:opacity-40"
          onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
          data-testid="study-next"
        >
          {t("game:study.next", { defaultValue: "Next" })}
        </button>
      </footer>
    </div>
  )
}

export const Route = createFileRoute("/quizz/$id/study")({
  component: StudyPage,
})

export default StudyPage
