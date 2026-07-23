import Checkbox from "@razzoozle/web/components/Checkbox"
import clsx from "clsx"

export interface RowSelectionControlProps {
  checked: boolean
  onChange: () => void
  ariaLabel: string
  disabled?: boolean
  indeterminate?: boolean
  "data-testid"?: string
}

const RowSelectionControl = ({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  indeterminate = false,
  "data-testid": dataTestId,
}: RowSelectionControlProps) => {
  return (
    <label
      className={clsx(
        "flex size-11 shrink-0 items-center justify-center rounded-lg",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <span className="sr-only">{ariaLabel}</span>
      <Checkbox
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        indeterminate={indeterminate}
        aria-label={ariaLabel}
        data-testid={dataTestId}
      />
    </label>
  )
}

RowSelectionControl.displayName = "RowSelectionControl"

export default RowSelectionControl
