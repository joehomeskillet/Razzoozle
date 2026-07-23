import Checkbox from "@razzoozle/web/components/Checkbox"
import { useTranslation } from "react-i18next"

export interface SelectAllControlProps {
  id: string
  allSelected: boolean
  someSelected: boolean
  selectedCount: number
  totalCount: number
  onToggleAll: () => void
  "data-testid"?: string
}

const SelectAllControl = ({
  id,
  allSelected,
  someSelected,
  selectedCount,
  totalCount,
  onToggleAll,
  "data-testid": dataTestId,
}: SelectAllControlProps) => {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-11 shrink-0 items-center gap-3">
      <Checkbox
        id={id}
        checked={allSelected}
        indeterminate={someSelected}
        onChange={onToggleAll}
        data-testid={dataTestId}
      />
      <label htmlFor={id} className="cursor-pointer text-sm font-medium text-[var(--ink)]">
        {t("manager:bulk.selectAll")}
      </label>
      <span
        className="ml-auto text-sm tabular-nums text-[var(--ink-subtle)]"
        aria-live="polite"
      >
        {t("manager:bulk.selectedOfTotal", { selected: selectedCount, total: totalCount })}
      </span>
    </div>
  )
}

export default SelectAllControl
