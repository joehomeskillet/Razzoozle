import { EVENTS, SUBMISSION_CATEGORIES } from "@razzia/common/constants"
import type { SubmissionCategory } from "@razzia/common/constants"
import { dropEmptyAnswers } from "@razzia/common/utils/dropEmptyAnswers"
import { submissionValidator } from "@razzia/common/validators/submission"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
import Loader from "@razzia/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import QuestionEditorAcceptedAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAcceptedAnswers"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import QuestionEditorType from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorType"
import {
  QuizzEditorProvider,
  useQuizzEditor,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import QuestionMarksField from "@razzia/web/features/submission/QuestionMarksField"
import { useThemeStore } from "@razzia/web/features/theme/store"
import defaultLogo from "@razzia/web/assets/logo.svg"
import { CheckCircle2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type ReactNode, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface SubmitInnerProps {
  onReset: () => void
}

// Stable element ids so a validation failure can scroll+focus the offending
// field. The name input is owned here; the question/answers fields live in
// child editor components, so we anchor on their section containers.
const NAME_INPUT_ID = "submit-submitted-by"
const NAME_ERROR_ID = "submit-submitted-by-error"
const QUESTION_SECTION_ID = "submit-section-question"
const ANSWERS_SECTION_ID = "submit-section-answers"

// Which on-page target a failing validator path maps to. The submission
// validator parses `{ submittedBy, question }`, so issue paths start with
// "submittedBy" (the name field) or "question" (the editor sub-fields).
type InvalidTarget = "name" | "question" | "answers"

// questionValidator's superRefine emits answer-shape errors with path
// ["question"] (no index) and a known i18n message key, so a path-only check
// strands them on the question section. Match those messages (and "solutions")
// so they land on the ANSWERS section where the offending control lives.
const ANSWER_ERROR_MESSAGES = new Set([
  "errors:quizz.tooFewAnswers",
  "errors:quizz.tooManyAnswers",
  "errors:quizz.noSolution",
  "errors:quizz.solutionsMin2",
  "errors:quizz.answerEmpty",
  "errors:quizz.acceptedAnswersMin",
])

const resolveInvalidTarget = (
  path: PropertyKey[],
  message: string,
): InvalidTarget => {
  if (path[0] === "submittedBy") {
    return "name"
  }

  // path[0] === "question": answer-shape paths ("answers"/"acceptedAnswers"/
  // "solutions") AND the message-keyed superRefine answer errors → answers
  // section. Everything else (question text, slider refine issues) → question.
  if (
    path[1] === "answers" ||
    path[1] === "acceptedAnswers" ||
    path[1] === "solutions" ||
    ANSWER_ERROR_MESSAGES.has(message)
  ) {
    return "answers"
  }

  return "question"
}

interface RevealSectionProps {
  children: ReactNode
  index: number
  label: string
  id?: string
}

// Mirrors the console header brand (logo → appTitle → bundled logo).
const SubmitBrand = () => {
  const { theme } = useThemeStore()
  const appTitle = theme.appTitle?.trim()

  if (theme.logo) {
    return (
      <img
        src={theme.logo}
        alt={appTitle ?? "logo"}
        className="h-7 w-auto shrink-0 object-contain"
      />
    )
  }

  if (appTitle) {
    return <span className="truncate">{appTitle}</span>
  }

  return <img src={defaultLogo} alt="logo" className="h-7 w-auto shrink-0" />
}

const RevealSection = ({ children, index, label, id }: RevealSectionProps) => {
  const reducedMotion = useReducedMotion()

  return (
    <motion.section
      id={id}
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion
          ? undefined
          : { duration: 0.32, ease: "easeOut", delay: index * 0.06 }
      }
      className="flex flex-col gap-2"
    >
      <p className="w-fit text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </p>
      {children}
    </motion.section>
  )
}

const SubmitInner = ({ onReset }: SubmitInnerProps) => {
  const { currentQuestion } = useQuizzEditor()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [submittedBy, setSubmittedBy] = useState("")
  // WP-17 — optional public topic category; sibling of the question (not nested
  // in it). "" means "no category" and is simply omitted from the payload.
  const [category, setCategory] = useState<SubmissionCategory | "">("")
  const [status, setStatus] = useState<"idle" | "success">("idle")
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [invalidTarget, setInvalidTarget] = useState<InvalidTarget | null>(null)
  const [awaiting, setAwaiting] = useState(false)

  const isSlider = currentQuestion.type === "slider"
  const isTypeAnswer = currentQuestion.type === "type-answer"

  useEvent(EVENTS.MANAGER.SUBMIT_SUCCESS, () => {
    setAwaiting(false)
    setStatus("success")
  })

  useEvent(EVENTS.MANAGER.SUBMISSION_ERROR, (message) => {
    setAwaiting(false)
    toast.error(t(message))
  })

  const handleSubmit = () => {
    const { id: _id, ...rest } = currentQuestion
    // Trim unfilled answer slots (the editor defaults to four) so a 2–3 answer
    // question doesn't fail validation on the empty trailing slots.
    const question = dropEmptyAnswers(rest)
    const parsed = submissionValidator.safeParse({
      submittedBy,
      question,
      // WP-17 — include the optional category only when chosen.
      ...(category ? { category } : {}),
    })

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const target = resolveInvalidTarget(firstIssue.path, firstIssue.message)

      setFieldError(firstIssue.message)
      setInvalidTarget(target)

      // Scroll+focus the first invalid field so the user lands on it. The name
      // input can take focus directly; the editor sub-fields live in child
      // components we don't own, so we scroll their section into view and let
      // focus-within highlight the control inside.
      if (target === "name") {
        const nameInput = document.getElementById(NAME_INPUT_ID)
        nameInput?.scrollIntoView({ behavior: "smooth", block: "center" })
        nameInput?.focus()
      } else {
        const sectionId =
          target === "answers" ? ANSWERS_SECTION_ID : QUESTION_SECTION_ID
        const section = document.getElementById(sectionId)
        section?.scrollIntoView({ behavior: "smooth", block: "center" })
        // Move focus to the first focusable control inside the section so
        // keyboard users land on the offending field, not just see it.
        section
          ?.querySelector<HTMLElement>(
            "input, textarea, [contenteditable='true']",
          )
          ?.focus()
      }

      toast.error(t(firstIssue.message))

      return
    }

    setFieldError(null)
    setInvalidTarget(null)
    setAwaiting(true)
    socket.emit(EVENTS.MANAGER.SUBMIT_QUESTION, parsed.data)
  }

  const handleReset = () => {
    setSubmittedBy("")
    setCategory("")
    setStatus("idle")
    setFieldError(null)
    setInvalidTarget(null)
    setAwaiting(false)
    onReset()
  }

  // Clear a standing name error as soon as the user edits the field, mirroring
  // the subject-field pattern in QuizzEditorHeader.
  const handleNameChange = (value: string) => {
    setSubmittedBy(value)

    if (invalidTarget === "name") {
      setFieldError(null)
      setInvalidTarget(null)
    }
  }

  const nameInvalid = invalidTarget === "name"

  if (status === "success") {
    return (
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
        animate={reducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={
          reducedMotion ? undefined : { duration: 0.28, ease: "easeOut" }
        }
        className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-3xl bg-white p-8 text-center shadow-2xl"
      >
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
          animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.28, ease: "easeOut", delay: 0.08 }
          }
          className="flex size-16 items-center justify-center rounded-full bg-green-100 text-green-600"
        >
          <CheckCircle2 className="size-10" strokeWidth={2.5} />
        </motion.div>
        <h2 className="text-2xl font-bold text-gray-800">
          {t("submit:success.title")}
        </h2>
        <p className="text-sm leading-6 text-gray-600">
          {t("submit:success.body")}
        </p>
        <Button
          onClick={handleReset}
          className="min-h-11 w-full rounded-xl"
          size="md"
        >
          {t("submit:success.again")}
        </Button>
      </motion.div>
    )
  }

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.32, ease: "easeOut" }
      }
      className="relative z-10 flex max-h-[92svh] min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-gray-50 shadow-2xl"
    >
      {/* Branded header band — same treatment as the /manager/config console. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-200 bg-gradient-to-r from-[var(--accent-tint)] to-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 font-bold text-gray-900">
            <SubmitBrand />
          </div>
          <span aria-hidden className="hidden h-5 w-px bg-gray-300 sm:block" />
          <h1 className="hidden truncate text-lg font-semibold text-gray-700 sm:block">
            {t("submit:form.title")}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
        </div>
        <h1 className="w-full truncate text-base font-semibold text-gray-700 sm:hidden">
          {t("submit:form.title")}
        </h1>
      </header>

      {/*
        Body wrapper — owns the flex sizing and anchors the scroll-fade
        affordances. The scrollbar is deliberately hidden (a conscious
        decision), so on mobile it's otherwise unclear that more content
        follows. Two pointer-events-none gradient masks at the top/bottom
        edges signal "more above / more below". They use CSS scroll-driven
        animations so the top mask hides at scrollTop 0 and the bottom mask
        hides once the end is reached; browsers without scroll() timelines
        simply keep both masks visible (a harmless, still-useful hint).
        Reduced-motion is honoured below — the masks become a static, even
        affordance instead of fading with scroll position.
      */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <style>{`
          .submit-scroll-fade {
            opacity: 1;
          }
          .submit-scroll-body {
            scroll-timeline-name: --submit-scroll-tl;
            scroll-timeline-axis: block;
          }
          @supports (animation-timeline: scroll()) {
            .submit-scroll-fade--top {
              opacity: 0;
              animation: submit-fade-reveal linear both;
              animation-timeline: --submit-scroll-tl;
              animation-range: 0 2rem;
            }
            .submit-scroll-fade--bottom {
              opacity: 0;
              animation: submit-fade-reveal linear both reverse;
              animation-timeline: --submit-scroll-tl;
              animation-range: calc(100% - 2rem) 100%;
            }
          }
          @keyframes submit-fade-reveal {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            .submit-scroll-fade {
              opacity: 1;
              animation: none;
            }
          }
        `}</style>

        {/* Sunken gray surface so the white form cards read clearly. This is
            the single scroll owner; the fade masks (rendered just after it)
            ride its named scroll timeline. Extra pb keeps the last block
            clear of the sticky submit bar. */}
        <div className="submit-scroll-body flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-gray-50 p-4 pb-10 [scrollbar-width:none] sm:p-6 sm:pb-12 [&::-webkit-scrollbar]:hidden">
          <p className="mb-4 text-sm leading-6 text-gray-600">
            {t("submit:form.subtitle")}
          </p>

        {/*
          Two INDEPENDENT columns at xl (not a row-aligned grid): the old
          grid tied each row's height to the tallest cell, stranding the short
          "Name" card with a huge gap before "Media" and reflowing that shared
          row on every question-type switch. Independent flex columns size on
          their own content, so there is no cross-column gap and the secondary
          column never jumps when the answers reflow. Mobile stacks them in
          logical order: name → question → answers → media → settings.
        */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
          {/* Primary column — the question itself. */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <RevealSection index={0} label={t("submit:form.section.name")}>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <label htmlFor={NAME_INPUT_ID} className="sr-only">
                  {t("submit:form.namePlaceholder")}
                </label>
                <Input
                  id={NAME_INPUT_ID}
                  value={submittedBy}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t("submit:form.namePlaceholder")}
                  className="min-h-11 w-full rounded-xl"
                  autoComplete="name"
                  aria-invalid={nameInvalid ? true : undefined}
                  aria-describedby={nameInvalid ? NAME_ERROR_ID : undefined}
                />
                {nameInvalid && fieldError && (
                  <p
                    id={NAME_ERROR_ID}
                    className="mt-1.5 text-xs font-semibold text-red-600"
                  >
                    {t(fieldError)}
                  </p>
                )}
              </div>
            </RevealSection>

            <RevealSection
              id={QUESTION_SECTION_ID}
              index={1}
              label={t("submit:form.section.question")}
            >
              <QuestionEditorTitle />
              <div className="mt-2 rounded-2xl bg-white p-4 shadow-sm">
                <QuestionEditorType />
              </div>
            </RevealSection>

            {!isSlider && !isTypeAnswer && (
              <RevealSection
                id={ANSWERS_SECTION_ID}
                index={2}
                label={t("submit:form.section.answers")}
              >
                <div className="w-full overflow-hidden [&>div>div:nth-child(2)]:grid-cols-1 sm:[&>div>div:nth-child(2)]:grid-cols-2">
                  <QuestionEditorAnswers />
                </div>
              </RevealSection>
            )}

            {isTypeAnswer && (
              <RevealSection
                id={ANSWERS_SECTION_ID}
                index={2}
                label={t("submit:form.section.answers")}
              >
                <QuestionEditorAcceptedAnswers />
              </RevealSection>
            )}
          </div>

          {/* Secondary column — media + settings (stable across type switches). */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <RevealSection index={3} label={t("submit:form.section.media")}>
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm [&_audio]:max-w-full [&_img]:max-w-full [&_video]:max-w-full [&>div]:min-h-0">
                <QuestionEditorMedia />
              </div>
            </RevealSection>

            <RevealSection index={4} label={t("submit:form.section.settings")}>
              <div className="rounded-2xl bg-white p-4 shadow-sm [&>aside]:m-0 [&>aside]:w-full [&>aside]:overflow-visible [&>aside]:rounded-none [&>aside]:bg-transparent [&>aside]:p-0 [&>aside]:shadow-none">
                <QuestionEditorConfig />
              </div>
            </RevealSection>

            {/* WP-17 — optional public topic category. A sibling of the
                question, rides the submission payload (not the question). */}
            <RevealSection
              index={5}
              label={t("submit:category.label", {
                defaultValue: "Kategorie (optional)",
              })}
            >
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <label htmlFor="submit-category" className="sr-only">
                  {t("submit:category.label", {
                    defaultValue: "Kategorie (optional)",
                  })}
                </label>
                <select
                  id="submit-category"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as SubmissionCategory | "")
                  }
                  className="focus-visible:outline-primary min-h-11 w-full rounded-xl bg-white px-3 py-2 text-gray-900 outline-1 -outline-offset-1 outline-gray-200 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <option value="">—</option>
                  {SUBMISSION_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {t(`submit:category.${cat}`, { defaultValue: cat })}
                    </option>
                  ))}
                </select>
              </div>
            </RevealSection>
          </div>
        </div>
        </div>

        {/* Scroll-fade masks — rendered AFTER the scroller so they can
            reference its named scroll timeline (a named timeline is only
            visible to following siblings). Absolutely positioned + z-10, so
            DOM order doesn't change where they paint. */}
        {/* Top edge — paper-cream fade hinting at content above. */}
        <div
          aria-hidden
          className="submit-scroll-fade submit-scroll-fade--top pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-gray-50 to-transparent"
        />
        {/* Bottom edge — fade hinting at content hidden under the submit bar. */}
        <div
          aria-hidden
          className="submit-scroll-fade submit-scroll-fade--bottom pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-gray-50 to-transparent"
        />
      </div>

      {/* Footer submit bar — pinned to the panel bottom. */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
        {fieldError && (
          <p
            role="alert"
            className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-600"
          >
            {t(fieldError)}
          </p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={awaiting}
          aria-busy={awaiting}
          className="min-h-11 w-full rounded-xl xl:mx-auto xl:block xl:max-w-lg"
          size="md"
        >
          {awaiting && <Loader className="size-5 text-white" />}
          <span>{t("submit:form.submitButton")}</span>
        </Button>
      </div>
    </motion.section>
  )
}

const SubmitPage = () => {
  const [formKey, setFormKey] = useState(0)

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden p-3 sm:p-5">
      {/* Purple brand gradient + scrim behind everything (mirrors Background's
          `plain` recipe), so the surface's own header band carries the brand. */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, var(--color-secondary), var(--color-primary))",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: "var(--bg-scrim)" }}
        />
      </div>

      {/* Playful field of popping "?" glyphs — sits behind the form surface. */}
      <QuestionMarksField />

      <QuizzEditorProvider key={formKey} isManager={false}>
        <SubmitInner onReset={() => setFormKey((k) => k + 1)} />
      </QuizzEditorProvider>
    </div>
  )
}

export default SubmitPage
