import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { Minus, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

type Hotspot = { x: number; y: number; w: number; h: number }

const defaultZone = (): Hotspot => ({ x: 0.25, y: 0.25, w: 0.25, h: 0.25 })

const QuestionEditorDropPin = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()
  const hotspots: Hotspot[] =
    currentQuestion.hotspots?.length ? currentQuestion.hotspots : [defaultZone()]
  const mediaUrl = currentQuestion.media?.url

  const persist = (next: Hotspot[]) => {
    updateQuestion(currentIndex, {
      type: "drop-pin",
      hotspots: next,
      answers: undefined,
      solutions: undefined,
    })
  }

  const setZone = (idx: number, patch: Partial<Hotspot>) => {
    const next = hotspots.slice()
    next[idx] = { ...next[idx]!, ...patch }
    persist(next)
  }

  return (
    <div className="z-10 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-600">
        {t("quizz:dropPin.prompt", {
          defaultValue: "Draw relative zones (0–1) on the image media above",
        })}
      </p>
      {mediaUrl ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-gray-50">
          <img src={mediaUrl} alt="" className="h-full w-full object-contain" />
          {hotspots.map((h, i) => (
            <div
              key={i}
              className="absolute border-2 border-violet-500 bg-violet-400/30"
              style={{
                left: `${h.x * 100}%`,
                top: `${h.y * 100}%`,
                width: `${h.w * 100}%`,
                height: `${h.h * 100}%`,
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-amber-700">
          {t("errors:quizz.dropPinMediaRequired", {
            defaultValue: "Image required",
          })}
        </p>
      )}
      {hotspots.map((h, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-5">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              {k}
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={h[k]}
                onChange={(e) => setZone(i, { [k]: Number(e.target.value) })}
                className="min-h-10 rounded border px-2 text-sm"
                data-testid={`droppin-${k}-${i}`}
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => persist(hotspots.filter((_, j) => j !== i))}
            disabled={hotspots.length <= 1}
            className="inline-flex min-h-10 items-center justify-center rounded border disabled:opacity-40"
            aria-label={t("quizz:dropPin.removeZone", { defaultValue: "Remove zone" })}
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => persist([...hotspots, defaultZone()])}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-dashed text-sm font-medium"
        data-testid="droppin-add-zone"
      >
        <Plus className="h-4 w-4" />
        {t("quizz:dropPin.addZone", { defaultValue: "Add zone" })}
      </button>
    </div>
  )
}

export default QuestionEditorDropPin
