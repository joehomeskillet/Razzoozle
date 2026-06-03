import { DEFAULT_THEME, type Theme } from "@razzia/common/types/theme"

// Apply theme colors as CSS custom properties on <html>. Tailwind v4 utilities
// (bg-primary, bg-secondary) reference --color-* via var(), so overriding them
// at runtime re-colors the whole UI — including the manager mask. Answer button
// colors are exposed as --answer-1..4 (consumed by ANSWERS_COLORS).
export const applyTheme = (theme: Theme) => {
  const style = document.documentElement.style
  style.setProperty("--color-primary", theme.colorPrimary)
  style.setProperty("--color-secondary", theme.colorSecondary)
  theme.answerColors.forEach((color, i) => {
    style.setProperty(`--answer-${i + 1}`, color)
  })
}

// Fetch the persisted theme from the served config volume; fall back to the
// bundled default if it is missing or invalid.
export const fetchTheme = async (): Promise<Theme> => {
  try {
    const res = await fetch("/theme/theme.json", { cache: "no-store" })

    if (!res.ok) {
      return DEFAULT_THEME
    }

    return (await res.json()) as Theme
  } catch {
    return DEFAULT_THEME
  }
}
