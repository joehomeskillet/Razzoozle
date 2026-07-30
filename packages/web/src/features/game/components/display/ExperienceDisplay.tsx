/**
 * ExperienceDisplay — Content-free Display for Experience modes.
 *
 * Renders a static placeholder showing phase and progress counters {answered, total}
 * only. No question text, answers, media, or animations—pure display info for the
 * beamer/kiosk, divorced from player knowledge.
 *
 * Scaffolded via `pnpm g:display ExperienceDisplay` with WP 877.
 */

interface ExperienceTransition {
  mode: string
  phase: string
  answered?: number
  total?: number
}

export interface ExperienceDisplayProps {
  data: ExperienceTransition
}

export function ExperienceDisplay({ data }: ExperienceDisplayProps) {
  const phase = data.phase?.replace(/_/g, " ").toLowerCase() || "loading"
  const answered = data.answered ?? 0
  const total = data.total ?? 0
  const progressPct = total > 0 ? Math.round((answered / total) * 100) : 0

  return (
    <div className="display-stage flex h-full flex-col items-center justify-center gap-8 p-8 text-center">
      {/* Phase Display */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-[2vh] font-semibold uppercase tracking-widest text-ink-subtle">
          {phase}
        </p>
        <div className="h-1 w-64 rounded-full bg-surface-2">
          <div
            className="h-1 rounded-full bg-brand-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Progress Counter */}
      <div className="flex items-baseline gap-3">
        <span className="text-[10vh] font-extrabold text-ink">{answered}</span>
        <span className="text-[4vh] font-semibold text-ink-subtle"> / {total}</span>
      </div>

      {/* Percentage Display */}
      <p className="text-[3vh] font-medium text-ink-subtle">{progressPct}% complete</p>
    </div>
  )
}

export default ExperienceDisplay
