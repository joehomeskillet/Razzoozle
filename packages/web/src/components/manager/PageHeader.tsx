import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

const PageHeader = ({ title, subtitle, action }: PageHeaderProps) => {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm leading-6 text-[var(--ink-subtle)]">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

export default PageHeader
