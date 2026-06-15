import clsx from "clsx"
import type { ReactNode } from "react"

export interface FormSectionProps {
  /** Section heading text. */
  title: string
  /** Optional muted help text shown under the title. */
  description?: string
  children: ReactNode
  className?: string
}

/**
 * Semantic section block for form layouts. Provides a `<h3>` heading, an
 * optional muted description, and a `space-y-4` content area. Intended to be
 * separated by `mb-6` between sections (pass via `className` or wrap).
 */
const FormSection = ({
  title,
  description,
  children,
  className,
}: FormSectionProps) => (
  <section className={clsx("mb-6", className)}>
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {description && (
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      )}
    </div>
    <div className="space-y-4">{children}</div>
  </section>
)

export default FormSection
