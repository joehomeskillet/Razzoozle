import { SubGroup } from "@razzoozle/web/features/manager/components/console"
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

  return (
    <SubGroup>
      <div className="flex flex-col gap-2">
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
          className="min-h-48 w-full resize-y rounded-lg bg-gray-900 p-3 font-mono text-sm text-gray-100 outline-1 -outline-offset-1 outline-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        />
      </div>
    </SubGroup>
  )
}

export default AnimatedCssEditor
