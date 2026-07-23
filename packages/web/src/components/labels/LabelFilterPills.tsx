import clsx from "clsx"
import { useTranslation } from "react-i18next"
import { chipBase } from "@razzoozle/web/components/manager/Badge"
import type { Label } from "./LabelChip"
import { getLabelColor } from "./labelPalette"

interface LabelFilterPillsProps {
  labels: Label[]
  activeId: number | null
  onChange: (id: number | null) => void
}

// Farbpunkt: kräftigste Token-Variante je Label-Farbe (das `-bg`-Token der
// Palette ist ein 92%-Weiß-Tint → als Punkt kaum sichtbar). Statische
// Literale, damit Tailwind die Klassen sieht; Lookup über den von
// getLabelColor aufgelösten Slug (unbekannte Farben → gray-Fallback).
const DOT_BG: Record<string, string> = {
  red: "bg-[var(--label-red)]",
  blue: "bg-[var(--label-blue)]",
  green: "bg-[var(--label-green)]",
  yellow: "bg-[var(--label-yellow)]",
  purple: "bg-[var(--label-purple)]",
  pink: "bg-[var(--label-pink)]",
  indigo: "bg-[var(--label-indigo)]",
  gray: "bg-[var(--label-gray)]",
}

const dotBgClass = (slug: string): string =>
  DOT_BG[slug] ?? "bg-[var(--label-gray)]"

const stateClass = (active: boolean): string =>
  active
    ? "outline-1 -outline-offset-1 outline-[var(--color-primary)] bg-[var(--accent-tint)] text-[var(--accent-contrast)]"
    : "border border-[var(--border-hairline)] bg-[var(--surface-3)] text-[var(--ink-medium)] hover:bg-[var(--surface-4)]"

// Kompakte Filter-Chips (~24px sichtbar) mit Farbpunkt; Touch-Target ≥44px
// via before-Pseudo nach assignTriggerClass-Muster (SDD manager-row-system
// §7, R9). Keine Label-Vollfarbe mehr — Farbe lebt nur im Punkt.
const chipClass = (active: boolean): string =>
  clsx(
    chipBase,
    "relative gap-1.5",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
    "before:absolute before:-inset-2.5 before:content-['']",
    stateClass(active),
  )

export default function LabelFilterPills({
  labels,
  activeId,
  onChange,
}: LabelFilterPillsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={activeId === null}
        onClick={() => onChange(null)}
        className={chipClass(activeId === null)}
      >
        {t("manager:labels.filterAll", { defaultValue: "Alle" })}
      </button>
      {labels.map((label) => {
        const active = activeId === label.id

        return (
          <button
            key={label.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(label.id)}
            className={chipClass(active)}
          >
            <span
              aria-hidden
              className={clsx(
                "size-3 shrink-0 rounded-full",
                dotBgClass(getLabelColor(label.color).slug),
              )}
            />
            {label.name}
          </button>
        )
      })}
    </div>
  )
}
