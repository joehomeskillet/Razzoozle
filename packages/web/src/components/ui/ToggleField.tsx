import clsx from "clsx"

export interface ToggleFieldProps {
  /** Visible label text. */
  label: string
  /** Optional muted help text shown below the row. */
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}

/**
 * A label + toggle-switch row.
 *
 * Reuses the exact aria-switch markup and classes from ConfigGameMode:
 * `role="switch"`, `aria-checked`, `≥44px` hit area, `focus-visible` ring.
 * Label sits left, toggle right. Optional description below.
 * Stacks below `sm`.
 */
const ToggleField = ({
  label,
  description,
  checked,
  onChange,
  disabled,
}: ToggleFieldProps) => (
  <div className="flex flex-col gap-1">
    <div className="flex min-h-11 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <span
        className={clsx(
          "shrink-0 text-sm font-medium text-[var(--ink-muted)] sm:w-40",
          "flex items-center",
        )}
      >
        {label}
      </span>

      <div className="flex min-h-11 flex-1 items-center">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={clsx(
            "relative inline-flex h-11 w-14 shrink-0 cursor-pointer items-center rounded-full",
            "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
            "disabled:cursor-wait",
            checked ? "bg-[var(--color-primary)]" : "bg-[var(--surface-5)]",
          )}
        >
          <span
            className={clsx(
              "inline-block size-6 rounded-full bg-[var(--surface)] shadow transition-transform",
              checked ? "translate-x-8" : "translate-x-1",
            )}
          />
        </button>
      </div>
    </div>

    {description && (
      <p className="text-xs text-[var(--ink-subtle)] sm:pl-44">{description}</p>
    )}
  </div>
)

export default ToggleField
