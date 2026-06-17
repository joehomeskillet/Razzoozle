import {
  GraduationCap, BookOpen, Lightbulb, Pencil, Atom, FlaskConical,
  Brain, Globe, Calculator, Sigma, Compass, Microscope,
} from "lucide-react"
import type { CSSProperties } from "react"

const ICONS: { I: typeof GraduationCap; cls: string; style: CSSProperties }[] = [
  { I: GraduationCap, cls: "cb-ico cb-fa", style: { top: "7%", left: "5%", width: "5.5rem", color: "var(--color-primary)" } },
  { I: BookOpen, cls: "cb-ico cb-fb", style: { top: "12%", right: "7%", width: "5rem", color: "var(--color-accent)" } },
  { I: Lightbulb, cls: "cb-ico cb-fc", style: { top: "45%", right: "4%", width: "4.5rem", color: "var(--color-primary)" } },
  { I: Pencil, cls: "cb-ico cb-fb", style: { bottom: "9%", left: "7%", width: "5rem", color: "var(--color-accent)" } },
  { I: Atom, cls: "cb-ico cb-fa", style: { bottom: "8%", right: "6%", width: "6rem", color: "var(--color-primary)" } },
  { I: FlaskConical, cls: "cb-ico cb-fc", style: { top: "47%", left: "4%", width: "4.5rem", color: "var(--color-accent)" } },
  { I: Brain, cls: "cb-ico cb-fb", style: { top: "21%", left: "25%", width: "4rem", color: "var(--color-primary)" } },
  { I: Globe, cls: "cb-ico cb-fa", style: { bottom: "6%", left: "45%", width: "4.5rem", color: "var(--color-accent)" } },
  { I: Calculator, cls: "cb-ico cb-fc", style: { top: "30%", right: "25%", width: "3.6rem", color: "var(--color-primary)" } },
  { I: Sigma, cls: "cb-ico cb-fa", style: { top: "63%", left: "21%", width: "3.8rem", color: "var(--color-accent)" } },
  { I: Compass, cls: "cb-ico cb-fb", style: { top: "6%", right: "31%", width: "3.6rem", color: "var(--color-primary)" } },
  { I: Microscope, cls: "cb-ico cb-fc", style: { bottom: "27%", right: "15%", width: "4rem", color: "var(--color-accent)" } },
]

const CreamBackdrop = () => (
  <div aria-hidden className="cream-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    <span className="cb-blob cb-blob--a" />
    <span className="cb-blob cb-blob--b" />
    <span className="cb-blob cb-blob--c" />
    {ICONS.map(({ I, cls, style }, i) => (
      <I key={i} className={cls} style={style} strokeWidth={1.5} aria-hidden />
    ))}
  </div>
)

export default CreamBackdrop
