import clsx from "clsx"
import { useTranslation } from "react-i18next"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import type { Label } from "./LabelChip"
import { getLabelColor } from "./labelPalette"

interface LabelFilterPillsProps {
  labels: Label[]
  activeId: number | null
  onChange: (id: number | null) => void
}

export default function LabelFilterPills({
  labels,
  activeId,
  onChange,
}: LabelFilterPillsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterPill active={activeId === null} onClick={() => onChange(null)}>
        {t("manager:labels.filterAll", { defaultValue: "Alle" })}
      </FilterPill>
      {labels.map((label) => {
        const colors = getLabelColor(label.color)

        return (
          <FilterPill
            key={label.id}
            active={activeId === label.id}
            onClick={() => onChange(label.id)}
            activeClassName={clsx(colors.bg, colors.text)}
          >
            {label.name}
          </FilterPill>
        )
      })}
    </div>
  )
}
