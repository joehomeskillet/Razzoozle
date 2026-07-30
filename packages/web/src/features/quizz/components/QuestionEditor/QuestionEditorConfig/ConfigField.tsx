import type { PropsWithChildren, ReactNode } from "react"

interface LabelProps {
  icon: ReactNode
  label: string
  unit?: string
}

const Label = ({ icon, label, unit = "sec" }: LabelProps) => (
  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-muted)]">
    {icon}
    {label}
    <span className="text-xs font-normal text-[var(--ink-subtle)]">({unit})</span>
  </div>
)

const Description = ({ children }: { children: string }) => (
  <p className="text-xs text-[var(--ink-subtle)]">{children}</p>
)

const ConfigField = ({ children }: PropsWithChildren) => (
  <div className="flex flex-col gap-1.5">{children}</div>
)

ConfigField.Label = Label
ConfigField.Description = Description

export default ConfigField
