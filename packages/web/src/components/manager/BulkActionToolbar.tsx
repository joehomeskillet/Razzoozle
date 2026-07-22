import Button from "@razzoozle/web/components/Button"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

export interface BulkActionToolbarProps {
  count: number
  label: string
  onClear: () => void
  children: ReactNode
}

/**
 * Shared bulk-action toolbar for manager list/grid views, extracted from
 * ConfigMedia's inline selection bar. Rendered by the caller only while a
 * selection is active.
 *
 * - `label` provides the toolbar's accessible name (aria-label).
 * - The selected-count text comes from manager:bulk.selected.
 * - Action buttons are passed as children and pushed right via ml-auto;
 *   the clear-selection button is always rendered last.
 * - All styling via design tokens (same classes as the ConfigMedia toolbar).
 */
const BulkActionToolbar = ({
  count,
  label,
  onClear,
  children,
}: BulkActionToolbarProps) => {
  const { t } = useTranslation()

  return (
    <div
      role="toolbar"
      aria-label={label}
      className="mb-3 flex w-full flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 outline-2 -outline-offset-2 outline-[var(--border-hairline)]"
    >
      <span className="text-sm font-semibold text-[var(--ink-muted)]">
        {t("manager:bulk.selected", { count })}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X className="size-4" aria-hidden />
          {t("manager:bulk.clearSelection")}
        </Button>
      </div>
    </div>
  )
}

export default BulkActionToolbar
