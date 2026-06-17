import QuestionEditor from "@razzoozle/web/features/quizz/components/QuestionEditor"
import QuestionEditorAIAssist from "@razzoozle/web/features/quizz/components/QuestionEditorAIAssist"
import QuizzEditorHeader from "@razzoozle/web/features/quizz/components/QuizzEditorHeader"
import QuizzEditorSidebar from "@razzoozle/web/features/quizz/components/QuizzEditorSidebar"
// Side-effect: defines `--accent-tint` / `--accent-contrast`, the derived theme
// tokens the header band + active type pills consume. Shared with the console.
import "@razzoozle/web/features/manager/components/console/tokens.css"

/**
 * The editor frame: a solid white app surface holding header · sidebar ·
 * canvas · config. The page background is the single body cream gradient,
 * which shows through around the surface.
 *
 * Responsive (mobile-first):
 *  - < md (768px): everything STACKS — the slide sidebar is a horizontal
 *    scroller above the canvas, and the per-question config flows full-width
 *    below it (handled inside `QuestionEditor`).
 *  - ≥ md: the slide rail sits to the left of the canvas.
 *  - ≥ xl: the config rail moves to a third column beside the canvas.
 *
 * Never puts gray/dark text directly on the page — all content lives on the
 * white surface; the cream body only frames it (matches /submit + the console).
 */
const QuizzEditorShell = () => {
  return (
    <div className="relative flex h-svh flex-col overflow-hidden">
      {/* Solid app surface — content sits here, never on the page background. */}
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
