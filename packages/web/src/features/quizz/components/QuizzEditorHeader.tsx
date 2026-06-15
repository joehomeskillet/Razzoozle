import * as RadixAlertDialog from "@radix-ui/react-alert-dialog"
import { EVENTS } from "@razzia/common/constants"
import { dropEmptyAnswers } from "@razzia/common/utils/dropEmptyAnswers"
import { quizzValidator } from "@razzia/common/validators/quizz"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import Loader from "@razzia/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useNavigate } from "@tanstack/react-router"
import clsx from "clsx"
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { useReducedMotion } from "motion/react"

const SUBJECT_INPUT_ID = "quizz-subject-input"
const SUBJECT_ERROR_ID = "quizz-subject-error"

const QuizzEditorHeader = () => {
  const {
    quizzId,
    subject,
    setSubject,
    themeId,
    setThemeId,
    questions,
    setCurrentIndex,
    isDirty,
    markSaved,
  } = useQuizzEditor()
  const { themeTemplates } = useConfig()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()

  const [isSaving, setIsSaving] = useState(false)
  const [subjectError, setSubjectError] = useState<string | null>(null)
  // Open state of the "unsaved changes" confirm-on-leave dialog.
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  // When true, the next successful save should also navigate away (used by the
  // "Speichern" branch of the leave dialog).
  const leaveAfterSaveRef = useRef(false)

  const handleChangeSubject = (e: ChangeEvent<HTMLInputElement>) => {
    setSubject(e.target.value)

    if (subjectError) {
      setSubjectError(null)
    }
  }

  const handleSave = useCallback(() => {
    if (isSaving) {
      return
    }

    setSubjectError(null)

    // Trim unfilled answer slots (editor defaults to four) before validation AND
    // before emit so a 2–3 answer question doesn't trip errors:quizz.answerEmpty
    // here or on the server's re-validation.
    const trimmedQuestions = questions.map(dropEmptyAnswers)
    const result = quizzValidator.safeParse({
      subject,
      questions: trimmedQuestions,
    })

    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const { path } = firstIssue

      if (path[0] === "subject") {
        setSubjectError(firstIssue.message)
        document.getElementById(SUBJECT_INPUT_ID)?.focus()
      } else if (path[0] === "questions" && typeof path[1] === "number") {
        // Jump to the first question that failed so its field is visible.
        setCurrentIndex(path[1])
      }

      toast.error(t(firstIssue.message))

      // Validation failed: cancel any pending leave-after-save intent so the
      // user stays in the editor to fix the error.
      leaveAfterSaveRef.current = false

      return
    }

    setIsSaving(true)

    const themeFields = themeId ? { themeId } : {}

    if (quizzId) {
      socket.emit(EVENTS.QUIZZ.UPDATE, {
        id: quizzId,
        subject,
        questions: trimmedQuestions,
        ...themeFields,
      })
    } else {
      socket.emit(EVENTS.QUIZZ.SAVE, {
        subject,
        questions: trimmedQuestions,
        ...themeFields,
      })
    }
  }, [isSaving, subject, questions, themeId, quizzId, socket, setCurrentIndex, t])

  // Navigate to the manager target unless a save-then-leave is already pending.
  const handleExit = () => {
    if (isDirty) {
      setLeaveDialogOpen(true)
      return
    }

    navigate({ to: "/manager" })
  }

  // "Speichern" branch of the leave dialog: save, then leave once the
  // save-success event re-baselines and fires the navigate below.
  const handleSaveAndLeave = () => {
    setLeaveDialogOpen(false)
    leaveAfterSaveRef.current = true
    handleSave()
  }

  // "Verwerfen" branch: drop unsaved changes and leave immediately.
  const handleDiscardAndLeave = () => {
    setLeaveDialogOpen(false)
    leaveAfterSaveRef.current = false
    navigate({ to: "/manager" })
  }

  const onSaveSettled = useCallback(() => {
    markSaved()

    // Clear the leave-after-save intent now that the save has landed. The
    // navigate (if any) reads leaveAfterSaveRef BEFORE this resets it.
    leaveAfterSaveRef.current = false
  }, [markSaved])

  useEvent(EVENTS.QUIZZ.SAVE_SUCCESS, () => {
    setIsSaving(false)
    // Read the leave intent before onSaveSettled() clears it: only the Save
    // button / leave-dialog set it, so Ctrl+S saves and STAYS in the editor.
    const shouldLeave = leaveAfterSaveRef.current
    onSaveSettled()
    toast.success(t("quizz:quizzSaved"))
    if (shouldLeave) {
      navigate({ to: "/manager/config" })
    }
  })

  useEvent(EVENTS.QUIZZ.UPDATE_SUCCESS, (_data) => {
    setIsSaving(false)
    const shouldLeave = leaveAfterSaveRef.current
    onSaveSettled()
    toast.success(t("quizz:quizzUpdated"))
    if (shouldLeave) {
      navigate({ to: "/manager/config" })
    }
  })

  useEvent(EVENTS.QUIZZ.ERROR, (message) => {
    setIsSaving(false)
    leaveAfterSaveRef.current = false
    toast.error(t(message))
  })

  // Ctrl/Cmd+S saves WITHOUT leaving the editor (it never sets
  // leaveAfterSaveRef, so the success handler skips the navigate) and
  // suppresses the browser's own "save page" dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleSave])

  // Warn on hard navigation / tab close while there are unsaved changes.
  useEffect(() => {
    if (!isDirty) {
      return
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Legacy compatibility — some browsers require returnValue to be set.
      e.returnValue = ""
    }

    window.addEventListener("beforeunload", onBeforeUnload)

    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isDirty])

  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-200 bg-gradient-to-r from-[var(--accent-tint)] to-white px-4 py-3 shadow-sm sm:px-6">
      <div className="flex min-w-0 flex-1 flex-col">
        <Input
          id={SUBJECT_INPUT_ID}
          variant="sm"
          className="min-h-11 w-full max-w-xs"
          value={subject}
          onChange={handleChangeSubject}
          placeholder={t("quizz:titleQuizzPlaceholder")}
          aria-label={t("quizz:subjectInputLabel")}
          aria-invalid={subjectError ? true : undefined}
          aria-errormessage={subjectError ? SUBJECT_ERROR_ID : undefined}
        />
        {subjectError && (
          <span
            id={SUBJECT_ERROR_ID}
            className="mt-0.5 text-xs font-semibold text-red-500"
          >
            {t(subjectError)}
          </span>
        )}

        <label className="mt-1 flex items-center gap-2 text-xs font-medium text-gray-600">
          {t("quizz:themePicker.label")}
          <select
            value={themeId}
            onChange={(e) => setThemeId(e.target.value)}
            className="min-h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            <option value="">{t("quizz:themePicker.global")}</option>
            {(themeTemplates ?? []).map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          className="focus-visible:outline-primary min-h-11 bg-gray-100 px-4 font-semibold text-gray-700 hover:bg-gray-200"
          onClick={handleExit}
        >
          {t("common:exit")}
        </Button>
        <Button
          size="sm"
          className="relative min-h-11 px-4"
          onClick={() => {
            // Explicit Save button preserves save-and-close: set the leave
            // intent so the success handler navigates to /manager/config.
            leaveAfterSaveRef.current = true
            handleSave()
          }}
          disabled={isSaving}
          aria-busy={isSaving}
        >
          {isSaving && <Loader className="size-5 text-white" />}
          {t("common:save")}
          {isDirty && (
            <span
              role="status"
              aria-label={t("manager:editor.unsavedChanges", {
                defaultValue: "Ungespeicherte Änderungen",
              })}
              title={t("manager:editor.unsavedChanges", {
                defaultValue: "Ungespeicherte Änderungen",
              })}
              className={clsx(
                "absolute -top-1 -right-1 size-3 rounded-full bg-amber-400 ring-2 ring-white",
                !shouldReduceMotion && "animate-pulse",
              )}
            />
          )}
        </Button>
      </div>

      <RadixAlertDialog.Root
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
      >
        <RadixAlertDialog.Portal>
          <RadixAlertDialog.Overlay
            className={clsx(
              "fixed inset-0 z-50 bg-black/40",
              !shouldReduceMotion && "data-[state=open]:animate-fade-in",
            )}
          />

          <RadixAlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl">
            <RadixAlertDialog.Title className="text-lg font-semibold text-gray-900">
              {t("manager:editor.leaveTitle", {
                defaultValue: "Ungespeicherte Änderungen",
              })}
            </RadixAlertDialog.Title>

            <RadixAlertDialog.Description className="mt-2 text-gray-500">
              {t("manager:editor.leaveDescription", {
                defaultValue:
                  "Du hast Änderungen, die noch nicht gespeichert wurden. Möchtest du sie speichern, bevor du das Quiz verlässt?",
              })}
            </RadixAlertDialog.Description>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <RadixAlertDialog.Cancel asChild>
                <Button variant="secondary" className="min-h-11">
                  {t("common:cancel")}
                </Button>
              </RadixAlertDialog.Cancel>

              <Button
                variant="danger"
                className="min-h-11"
                onClick={handleDiscardAndLeave}
              >
                {t("manager:editor.discard", { defaultValue: "Verwerfen" })}
              </Button>

              <Button
                variant="primary"
                className="min-h-11"
                onClick={handleSaveAndLeave}
              >
                {t("common:save")}
              </Button>
            </div>
          </RadixAlertDialog.Content>
        </RadixAlertDialog.Portal>
      </RadixAlertDialog.Root>
    </header>
  )
}

export default QuizzEditorHeader
