import type { QuestionWithId } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"

interface Props {
  question: QuestionWithId
}

/**
 * QuestionPreview — Renders a typespezifische Miniatur für alle 13 Fragetypen.
 * Wird im Quiz-Editor in der Fragenliste verwendet.
 * Spec: docs/design/question-preview-sdd.md §3–4
 */
export default function QuestionPreview({ question }: Props) {
  // Slider: Bereich min–max [unit]
  if (question.type === "slider") {
    return (
      <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-xs font-semibold text-gray-500">
        {question.min}–{question.max}
        {question.unit ? ` ${question.unit}` : ""}
      </div>
    )
  }

  // Type-answer: Aa Symbol
  if (question.type === "type-answer") {
    return (
      <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-xs font-semibold text-gray-500">
        Aa
      </div>
    )
  }

  // Sentence-builder: 3× graue Striche
  if (question.type === "sentence-builder") {
    return (
      <div className="relative z-10 flex gap-1">
        {(question.chunks ?? []).slice(0, 3).map((_, i) => (
          <div
            key={i}
            className="h-3 flex-1 rounded-full bg-gray-300"
          />
        ))}
      </div>
    )
  }

  // Sequencing: 3× nummerierte Striche
  if (question.type === "sequencing") {
    return (
      <div className="relative z-10 flex flex-col gap-1">
        {(question.items ?? []).slice(0, 3).map((_, i) => (
          <div
            key={i}
            className="flex h-3 items-center gap-1 rounded-md border border-gray-300 px-1.5"
          >
            <span className="text-xs font-semibold text-gray-500">{i + 1}.</span>
            <div className="flex-1 bg-gray-300 rounded" />
          </div>
        ))}
      </div>
    )
  }

  // Poll: 2× horizontale Striche
  if (question.type === "poll") {
    return (
      <div className="relative z-10 flex flex-col gap-1">
        {[0, 1].map((i) => (
          <div key={i} className="h-3 w-full rounded-md border border-gray-300" />
        ))}
      </div>
    )
  }

  // Boolean: 2-spaltige Grid
  if (question.type === "boolean") {
    return (
      <div className="relative z-10 grid grid-cols-2 gap-1">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-4 rounded-md border border-gray-300"
          />
        ))}
      </div>
    )
  }

  // Mathematik: Numerischer Wert ± Toleranz
  if (question.type === "mathematik") {
    const correct = question.correct
    const tolerance = question.tolerance ?? 0

    return (
      <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-xs font-semibold text-gray-500">
        {correct !== undefined ? (
          <>
            {correct}
            {tolerance > 0 && ` ± ${tolerance}`}
          </>
        ) : (
          "Σ"
        )}
      </div>
    )
  }

  // Wortarten: Token-Badges
  if (question.type === "wortarten") {
    const tokens = question.tokens ?? []

    if (tokens.length === 0) {
      return (
        <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-xs font-semibold text-gray-500">
          –
        </div>
      )
    }

    return (
      <div className="relative z-10 flex flex-wrap gap-1">
        {tokens.slice(0, 4).map((token, i) => (
          <span
            key={i}
            className="inline-block px-2 py-0.5 rounded-full text-xs bg-[var(--surface-3)] text-[var(--ink)] truncate max-w-[80px]"
            title={token}
          >
            {token}
          </span>
        ))}
      </div>
    )
  }

  // Fill-blank: Segmente + Slot-Dropdowns
  if (question.type === "fill-blank") {
    const segments = question.segments ?? []
    const slots = question.slots ?? []

    // Fallback: wenn keine Segmente, zeige nur Slot-Nummern
    if (slots.length === 0) {
      return (
        <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-xs font-semibold text-gray-500">
          –
        </div>
      )
    }

    if (segments.length === 0) {
      return (
        <div className="relative z-10 flex flex-wrap items-center gap-1">
          {slots.map((_, i) => (
            <span
              key={i}
              className="inline-block px-2 py-1 h-4 rounded-md border border-gray-300 bg-gray-50 text-xs font-semibold text-gray-500"
            >
              [{i + 1}]
            </span>
          ))}
        </div>
      )
    }

    // Mit Segmenten: abwechselnd Text + Slot-Dropdowns
    return (
      <div className="relative z-10 flex flex-wrap items-center gap-1">
        {segments.slice(0, slots.length + 1).map((seg, i) => (
          <div key={`seg-${i}`}>
            {seg && (
              <span className="text-xs text-gray-600 truncate max-w-[60px]">
                {seg.length > 20 ? seg.substring(0, 20) + "…" : seg}
              </span>
            )}
            {i < slots.length && (
              <span className="inline-block ml-1 px-1.5 py-1 h-4 rounded-md border border-gray-300 bg-[var(--surface-2)] text-xs text-gray-500">
                ▼
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  // Matching: Left-items mit Pfeilen + Dropdowns
  if (question.type === "matching") {
    const leftItems = question.leftItems ?? []

    if (leftItems.length === 0) {
      return (
        <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-xs font-semibold text-gray-500">
          –
        </div>
      )
    }

    return (
      <div className="relative z-10 flex flex-col gap-1">
        {leftItems.slice(0, 3).map((item, i) => (
          <div key={i} className="flex items-center gap-1 h-4">
            <span className="truncate text-xs flex-1 font-semibold text-[var(--ink)] max-w-[60px]">
              {item.label}
            </span>
            <span className="text-gray-500 text-xs">→</span>
            <span className="flex-1 border rounded-md px-1 h-4 text-xs bg-[var(--surface-2)] text-gray-500">
              ▼
            </span>
          </div>
        ))}
      </div>
    )
  }

  // Drop-pin: Bild + Hotspot-Markierungen
  if (question.type === "drop-pin") {
    const media = question.media
    const hotspots = question.hotspots ?? []

    if (!media?.url) {
      return (
        <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-xs font-semibold text-gray-500">
          –
        </div>
      )
    }

    return (
      <div className="relative z-10 flex flex-col items-center gap-1">
        <div className="relative mx-auto max-h-10 w-auto">
          <img
            src={media.url}
            alt=""
            className="mx-auto max-h-10 w-auto rounded-md"
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
          {/* Hotspot-Overlay: kleine Punkte */}
          {hotspots.map((hs, i) => (
            <div
              key={i}
              className="absolute size-2 bg-red-400 rounded-full border border-red-600 pointer-events-none"
              style={{
                left: `${hs.x * 100}%`,
                top: `${hs.y * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              title={`Hotspot ${i + 1}`}
            />
          ))}
        </div>
        {hotspots.length > 0 && (
          <span className="text-xs text-gray-500">
            {hotspots.length} Hotspot{hotspots.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    )
  }

  // Choice / Multiple-select / Fallback: Grid 2 Spalten mit grünen Punkten
  // (default case: alle unbekannten Typen oder choice/multiple-select)
  return (
    <div className="relative z-10 grid grid-cols-2 gap-1">
      {(question.answers ?? []).map((_, i) => (
        <div
          key={i}
          className="flex h-4 flex-1 items-center rounded-md border border-gray-300 px-0.5"
        >
          {(question.solutions ?? []).includes(i) && (
            <div className="ml-auto size-1.5 rounded-full bg-green-400" />
          )}
        </div>
      ))}
    </div>
  )
}
