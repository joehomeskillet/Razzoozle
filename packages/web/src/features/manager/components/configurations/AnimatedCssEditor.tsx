import { SubGroup } from "@razzoozle/web/features/manager/components/console"
import { Copy } from "lucide-react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

export interface AnimatedCssEditorProps {
  /** Current animated-background CSS (theme.backgrounds.animatedCss). */
  value: string
  /** Persist the CSS edit back to the caller. */
  onChange: (css: string) => void
}

/**
 * AnimatedCssEditor — the controlled "CSS-Editor" sub-block extracted from
 * AnimatedBackgroundControls so the exact same UI can be reused from the dev
 * console. Pure presentational/controlled: a labelled mono textarea that edits
 * the animated-background CSS override (e.g. .cb-blob, keyframe overrides). The
 * cream-token styling and i18n keys are kept byte-identical to the original
 * block so neither caller's look nor its translations drift.
 */
const AnimatedCssEditor = ({ value, onChange }: AnimatedCssEditorProps) => {
  const { t } = useTranslation()

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t("common:copied"))
    } catch {
      toast.error(t("common:networkError"))
    }
  }

  return (
    <SubGroup>
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-[var(--ink-muted)]">
              {t("manager:theme.animatedBg.css.title", {
                defaultValue: "CSS-Editor",
              })}
            </p>
            <p className="text-sm text-[var(--ink-subtle)]">
              {t("manager:theme.animatedBg.css.description", {
                defaultValue:
                  "Eigenes CSS für den animierten Hintergrund (z. B. .cb-blob, Keyframes überschreiben).",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void copyToClipboard()
            }}
            aria-label={t("common:copy")}
            title={t("common:copy")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            <Copy className="size-4" aria-hidden />
          </button>
        </div>
        <label htmlFor="anim-bg-css" className="sr-only">
          {t("manager:theme.animatedBg.css.title", {
            defaultValue: "CSS-Editor",
          })}
        </label>
        <textarea
          id="anim-bg-css"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          rows={12}
          placeholder={t("manager:theme.animatedBg.css.placeholder", {
            defaultValue:
              "/* .cream-backdrop .cb-blob--a { background: ... } */",
          })}
          className="min-h-48 w-full resize-y rounded-lg bg-[var(--surface-muted)] p-3 font-mono text-sm text-[var(--surface)] outline-1 -outline-offset-1 outline-[var(--surface-4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        />
      </div>
    </SubGroup>
  )
}

export default AnimatedCssEditor
