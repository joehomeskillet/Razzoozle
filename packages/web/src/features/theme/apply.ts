import { DEFAULT_THEME, type Theme } from "@razzia/common/types/theme"

// Apply theme values as CSS custom properties on <html>. Tailwind v4 utilities
// (bg-primary, etc.) reference --color-* via var(), so overriding them at runtime
// re-colors the whole UI. Other tokens are consumed via bg-[var(--x)] classes.
export const applyTheme = (theme: Theme) => {
  const t: Theme = { ...DEFAULT_THEME, ...theme }
  const style = document.documentElement.style
  style.setProperty("--color-primary", t.colorPrimary)
  style.setProperty("--color-secondary", t.colorSecondary)
  style.setProperty("--color-text", t.colorText)
  style.setProperty("--color-accent", t.accentColor)
  style.setProperty("--answer-text", t.answerTextColor)
  t.answerColors.forEach((color, i) => {
    style.setProperty(`--answer-${i + 1}`, color)
  })
  style.setProperty("--radius-theme", `${t.radius}px`)
  style.setProperty("--bg-scrim", `${t.scrim / 100}`)

  if (typeof document !== "undefined") {
    document.title = t.appTitle?.trim() || "Razzia"
  }
}

// Fetch the persisted theme from the served config volume; fall back to the
// bundled default (and fill any missing fields) if missing or invalid.
export const fetchTheme = async (): Promise<Theme> => {
  try {
    const res = await fetch("/theme/theme.json", { cache: "no-store" })

    if (!res.ok) {
      return DEFAULT_THEME
    }

    return { ...DEFAULT_THEME, ...((await res.json()) as Partial<Theme>) }
  } catch {
    return DEFAULT_THEME
  }
}
