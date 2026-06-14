import QuestionEditor from "@razzia/web/features/quizz/components/QuestionEditor"
import QuestionEditorAIAssist from "@razzia/web/features/quizz/components/QuestionEditorAIAssist"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import QuizzEditorSidebar from "@razzia/web/features/quizz/components/QuizzEditorSidebar"
import { useThemeStore } from "@razzia/web/features/theme/store"
// Side-effect: defines `--accent-tint` / `--accent-contrast`, the derived theme
// tokens the header band + active type pills consume. Shared with the console.
import "@razzia/web/features/manager/components/console/tokens.css"

/**
 * The editor frame: the themed background photo + a dark scrim behind, then a
 * solid white app surface holding header · sidebar · canvas · config.
 *
 * Responsive (mobile-first):
 *  - < md (768px): everything STACKS — the slide sidebar is a horizontal
 *    scroller above the canvas, and the per-question config flows full-width
 *    below it (handled inside `QuestionEditor`).
 *  - ≥ md: the slide rail sits to the left of the canvas.
 *  - ≥ xl: the config rail moves to a third column beside the canvas.
 *
 * Never puts gray/dark text directly on the photo — all content lives on the
 * white surface; the photo only frames it (matches /submit + the console).
 */
const QuizzEditorShell = () => {
  const { theme } = useThemeStore()
  const authBg = theme.backgrounds.auth

  return (
    <div className="relative flex h-svh flex-col overflow-hidden">
      {/* Themed background photo + dark scrim (same recipe as Background). */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {authBg ? (
          <img
            src={authBg}
            alt=""
            aria-hidden
            className="pointer-events-none h-full w-full object-cover select-none"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--color-secondary), var(--color-primary))",
            }}
          />
        )}
        <div
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: "var(--bg-scrim)" }}
        />
      </div>

      {/* Solid app surface — content sits here, never on the photo. */}
      <div className="relative z-10 m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-gray-50 shadow-lg sm:m-3 2xl:mx-auto 2xl:w-full 2xl:max-w-[110rem]">
        <QuizzEditorHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <QuizzEditorSidebar />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <QuestionEditorAIAssist />
            <QuestionEditor />
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuizzEditorShell
