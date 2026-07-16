import type { Question, QuizzWithId } from "@razzoozle/common/types/game"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react"
import { v7 as uuid } from "uuid"

export type QuestionWithId = Question & {
  id: string
}

interface QuizzEditorContextType {
  quizzId: string | null
  /**
   * True for manager-side editor mounts, false for the public /submit page.
   * Gates manager-only affordances (e.g. the media-library picker, which
   * relies on the withAuth-gated MEDIA.LIST event).
   */
  isManager: boolean
  subject: string
  setSubject: (_subject: string) => void
  themeId: string
  setThemeId: (_themeId: string) => void
  questions: QuestionWithId[]
  currentIndex: number
  currentQuestion: QuestionWithId
  setCurrentIndex: (_index: number) => void
  addQuestion: () => void
  removeQuestion: (_index: number) => void
  removeQuestions: (_indices: number[]) => void
  reorderQuestions: (_from: number, _to: number) => void
  updateQuestion: (_index: number, _updates: Partial<QuestionWithId>) => void
  /**
   * Silent update: applies a patch to a question without marking the editor as dirty.
   * Used for internal normalization (e.g., self-healing posSet on mount) where the
   * change should not trigger beforeunload prompts.
   *
   * IMPORTANT: Only updates the saved snapshot if the editor is currently pristine.
   * This prevents accidentally absorbing unrelated unsaved edits from other questions.
   * If already dirty, leaves the snapshot unchanged so beforeunload protection remains
   * active and user changes are not silently lost.
   */
  silentUpdateQuestion: (_index: number, _updates: Partial<QuestionWithId>) => void
  /** True when the editor state diverges from the last-saved snapshot. */
  isDirty: boolean
  /**
   * Re-baseline the dirty snapshot to the current state. Call after a
   * successful save so the editor is considered "clean" again.
   */
  markSaved: () => void
}

const QuizzEditorContext = createContext<QuizzEditorContextType | null>(null)

const defaultQuestion = (): QuestionWithId => ({
  id: uuid(),
  question: "",
  // Default to four answer slots (A–D), the classic quiz layout. The editor
  // caps answers at [2,4]; "Remove answer" drops unwanted slots down to 2.
  answers: ["", "", "", ""],
  solutions: [0],
  cooldown: 5,
  time: 20,
})

const toQuestionWithId = (q: Question): QuestionWithId => ({
  ...q,
  id: uuid(),
})

/**
 * Stable serialization of the editor state used for dirty-tracking. The
 * editor-local `id` on each question is regenerated on load and carries no
 * persisted meaning, so it is stripped to avoid false-positive dirtiness.
 */
const snapshotOf = (
  subject: string,
  themeId: string,
  questions: QuestionWithId[],
): string =>
  JSON.stringify({
    subject,
    themeId,
    questions: questions.map(({ id: _id, ...rest }) => rest),
  })

type QuizzEditorProviderProps = PropsWithChildren<{
  initialData?: QuizzWithId
  isManager?: boolean
}>

export const QuizzEditorProvider = ({
  children,
  initialData,
  isManager = true,
}: QuizzEditorProviderProps) => {
  const [subject, setSubject] = useState(
    initialData?.subject ?? "Untitled Quizz",
  )
  const [themeId, setThemeId] = useState(initialData?.themeId ?? "")
  const [questions, setQuestions] = useState<QuestionWithId[]>(
    initialData
      ? initialData.questions.map(toQuestionWithId)
      : [defaultQuestion()],
  )
  const [currentIndex, setCurrentIndex] = useState(0)

  // Last-saved baseline. Seeded from initialData (or the default new-quizz
  // state) on first render and re-baselined on save-success via markSaved().
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshotOf(
      initialData?.subject ?? "Untitled Quizz",
      initialData?.themeId ?? "",
      initialData
        ? initialData.questions.map(toQuestionWithId)
        : [defaultQuestion()],
    ),
  )

  const isDirty = useMemo(
    () => snapshotOf(subject, themeId, questions) !== savedSnapshot,
    [subject, themeId, questions, savedSnapshot],
  )

  const markSaved = useCallback(() => {
    setSavedSnapshot(snapshotOf(subject, themeId, questions))
  }, [subject, themeId, questions])

  // Clamp at read so currentQuestion is NEVER undefined, even during an
  // intermediate render where questions has shrunk (delete) but currentIndex
  // hasn't caught up yet — consumers read currentQuestion.type directly.
  const currentQuestion =
    questions[Math.min(Math.max(0, currentIndex), questions.length - 1)]

  const addQuestion = () => {
    setQuestions((prev) => [...prev, defaultQuestion()])
    setCurrentIndex(questions.length)
  }

  const removeQuestion = (index: number) => {
    // Never delete the last question (quizzValidator requires >=1) and never
    // leave currentQuestion undefined.
    if (questions.length <= 1) {
      return
    }

    // De-nested: calling setCurrentIndex INSIDE the setQuestions updater caused
    // an intermediate render with the shrunk list but a stale currentIndex
    // (out-of-bounds -> currentQuestion undefined -> crash). Both setters here
    // are batched into one commit instead.
    const newMaxIndex = questions.length - 2
    setQuestions((list) => list.filter((_, i) => i !== index))
    setCurrentIndex((current) =>
      Math.min(Math.max(0, current >= index ? current - 1 : current), newMaxIndex),
    )
  }

  const removeQuestions = (indices: number[]) => {
    // Bulk delete. De-duplicate + delete high→low so earlier indices don't
    // shift before we reach them. Never delete the last remaining question
    // (quizzValidator requires >=1): if the selection would empty the quiz,
    // keep one slide back by trimming the lowest-index entry from the removal
    // set. currentIndex is clamped after removal so currentQuestion is never
    // undefined.
    const removalSet = new Set(
      indices.filter((i) => i >= 0 && i < questions.length),
    )

    if (removalSet.size === 0) {
      return
    }

    // Guard: never remove every question. Drop the lowest index from the set so
    // the quiz keeps at least one slide.
    if (removalSet.size >= questions.length) {
      const keep = Math.min(...removalSet)
      removalSet.delete(keep)
    }

    if (removalSet.size === 0) {
      return
    }

    // How many removed entries sit at or before the current slide — used to
    // shift currentIndex by the right amount so it tracks the same logical slide
    // (or its predecessor when the current slide itself was removed).
    const removedBeforeOrAt = [...removalSet].filter(
      (i) => i <= currentIndex,
    ).length
    const remainingCount = questions.length - removalSet.size

    setQuestions((list) => list.filter((_, i) => !removalSet.has(i)))
    setCurrentIndex((current) =>
      Math.min(Math.max(0, current - removedBeforeOrAt), remainingCount - 1),
    )
  }

  const reorderQuestions = (from: number, to: number) => {
    setQuestions((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)

      return next
    })
    setCurrentIndex(to)
  }

  const updateQuestion = (index: number, updates: Partial<QuestionWithId>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...updates } : q)),
    )
  }

  const silentUpdateQuestion = (index: number, updates: Partial<QuestionWithId>) => {
    // Apply the patch to the questions state
    const updatedQuestions = questions.map((q, i) =>
      i === index ? { ...q, ...updates } : q
    )
    setQuestions(updatedQuestions)
    // Only update the saved snapshot if the editor is currently pristine.
    // This allows mount-normalization to fix structural issues (#28) without
    // absorbing unrelated user edits. If already dirty, leave the snapshot alone
    // so beforeunload remains sharp and preserves pending user changes.
    if (!isDirty) {
      setSavedSnapshot(snapshotOf(subject, themeId, updatedQuestions))
    }
  }

  return (
    <QuizzEditorContext.Provider
      value={{
        quizzId: initialData?.id ?? null,
        isManager,
        subject,
        setSubject,
        themeId,
        setThemeId,
        questions,
        currentIndex,
        currentQuestion,
        setCurrentIndex,
        addQuestion,
        removeQuestion,
        removeQuestions,
        reorderQuestions,
        updateQuestion,
        silentUpdateQuestion,
        isDirty,
        markSaved,
      }}
    >
      {children}
    </QuizzEditorContext.Provider>
  )
}

export const useQuizzEditor = () => {
  const ctx = useContext(QuizzEditorContext)

  if (!ctx) {
    throw new Error("useQuizzEditor must be used inside QuizzEditorProvider")
  }

  return ctx
}
