import clsx from "clsx"
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
} from "react"

export interface FieldProps {
  /** Label text (already translated). */
  label: string
  /** The control. A single form element receives `id`/`aria-describedby` wiring. */
  children: ReactNode
  /** Optional helper text shown under the control. */
  hint?: string
  /** Optional error message; when set, the control is marked invalid. */
  error?: string
  /** Override the generated id (e.g. to match an external control id). */
  htmlFor?: string
  className?: string
}

/**
 * A labelled form field (spec §4.7) — label + control + optional hint/error with
 * consistent spacing. Wires `htmlFor`/`id` and `aria-describedby`/`aria-invalid`
 * onto a single child control automatically, so callers just drop an
 * `<Input>`/`<select>` inside.
 *
 * Presentational; the control + strings are passed in.
 */
const Field = ({
  label,
  children,
  hint,
  error,
  htmlFor,
  className,
}: FieldProps) => {
  const generatedId = useId()

  // If the single child control already carries its own id, the label must
  // point at THAT id (we don't override the child's id below) — otherwise
  // htmlFor and the rendered control id diverge and the label is dead.
  const onlyChild = Children.count(children) === 1 ? Children.only(children) : null
  const childId =
    onlyChild && isValidElement(onlyChild)
      ? (onlyChild.props as { id?: string }).id
      : undefined

  const controlId = childId ?? htmlFor ?? generatedId
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined

  // Wire the single child control without forcing the caller to repeat ids.
  const control =
    onlyChild && isValidElement(onlyChild)
      ? cloneElement(onlyChild as ReactElement<Record<string, unknown>>, {
          id: (onlyChild.props as { id?: string }).id ?? controlId,
          "aria-describedby":
            (onlyChild.props as { ["aria-describedby"]?: string })[
              "aria-describedby"
            ] ?? describedBy,
          "aria-invalid":
            (onlyChild.props as { ["aria-invalid"]?: boolean })["aria-invalid"] ??
            (error ? true : undefined),
        })
      : children

  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={controlId}
        className="text-xs font-semibold tracking-wide text-gray-500 uppercase"
      >
        {label}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-sm text-gray-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export default Field
