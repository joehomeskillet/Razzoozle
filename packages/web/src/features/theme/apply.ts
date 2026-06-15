import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"

// Apply theme values as CSS custom properties on <html>. Tailwind v4 utilities
// (bg-primary, etc.) reference --color-* via var(), so overriding them at runtime
// re-colors the whole UI. Other tokens are consumed via bg-[var(--x)] classes.
export const applyTheme = (theme: Theme) => {
  const t: Theme = { ...DEFAULT_THEME, ...theme }
  const { style } = document.documentElement
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

  // data-theme-style drives all glass CSS in index.css. "flat" is the default and
  // is a no-op (no glass rules match), so the Südhang look is preserved exactly.
  document.documentElement.dataset.themeStyle = t.style ?? "flat"

  if (typeof document !== "undefined") {
    document.title = t.appTitle?.trim() ?? "Razzoozle"
  }
}

// Fetch the persisted theme from the served config volume; fall back to the
// bundled default (and fill any missing fields) if missing or invalid.
//
// This NEVER rejects: any failure — network error, non-2xx response, malformed
// or non-object JSON — resolves to the bundled DEFAULT_THEME. A theme-fetch
// failure must never crash the app or surface an unhandled promise rejection,
// so the worst case is simply that the default look is used (WP-C item 4).
export const fetchTheme = async (): Promise<Theme> => {
  try {
    const res = await fetch("/theme/theme.json", { cache: "no-store" })

    if (!res.ok) {
      return DEFAULT_THEME
    }

    const parsed: unknown = await res.json()

    // Guard against valid-but-unexpected JSON (null, an array, a primitive):
    // only spread when it's a plain object, otherwise keep the pure default.
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return DEFAULT_THEME
    }

    return { ...DEFAULT_THEME, ...(parsed as Partial<Theme>) }
  } catch {
    return DEFAULT_THEME
  }
}
