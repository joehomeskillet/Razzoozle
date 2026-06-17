import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import { THEME_TOKENS } from "@razzoozle/common/theme-tokens"

// Resolve a dot-path (e.g. "stateColors.correct") into a nested object.
const get = (obj: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | null | undefined)?.[k],
      obj,
    )

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

  // Registry loop — the 1:1 color tokens (teams, tiers, state, rank, misc). The
  // derived vars (-ring/-text/-glow/-soft/--timer-track) track these via
  // color-mix in index.css with zero JS. The `?? DEFAULT_THEME` fallback also
  // covers a shallow-merged partial nested object.
  for (const tok of THEME_TOKENS) {
    const v = get(t, tok.path) ?? get(DEFAULT_THEME, tok.path)
    if (typeof v === "string") style.setProperty(tok.cssVar, v)
  }

  // data-theme-style drives all glass CSS in index.css. "flat" is the default and
  // is a no-op (no glass rules match), so the Südhang look is preserved exactly.
  document.documentElement.dataset.themeStyle = t.style ?? "flat"

  if (typeof document !== "undefined") {
    document.title = t.appTitle?.trim() ?? "Razzoozle"

    // Skeleton CSS override — idempotent <link> keyed by id, version-busted so a
    // skeletonVersion bump reloads the file. Removed when disabled.
    const ensureLink = (enabled: boolean, v: number) => {
      const id = "skeleton-css"
      let el = document.getElementById(id) as HTMLLinkElement | null
      if (!enabled) {
        el?.remove()
        return
      }
      if (!el) {
        el = document.createElement("link")
        el.id = id
        el.rel = "stylesheet"
        document.head.appendChild(el)
      }
      el.href = `/theme/skeleton.css?v=${v}`
    }
    ensureLink(t.customCssEnabled, t.skeletonVersion)

    // Skeleton JS override — same idempotent pattern with a <script> appended to
    // <body>. Re-injecting on a version bump loads the new file (old side effects
    // persist until a full reload — documented ceiling). Manager-gated; this is
    // stored-XSS by design (see contract §1).
    if (typeof window !== "undefined") {
      // Minimal documented global the skeleton JS can read.
      ;(window as unknown as { razzoozle?: unknown }).razzoozle = {
        theme: t,
        skeletonVersion: t.skeletonVersion,
      }
    }
    const ensureScript = (enabled: boolean, v: number) => {
      const id = "skeleton-js"
      let el = document.getElementById(id) as HTMLScriptElement | null
      if (!enabled) {
        el?.remove()
        return
      }
      if (!el) {
        el = document.createElement("script")
        el.id = id
        document.body.appendChild(el)
      }
      el.src = `/theme/skeleton.js?v=${v}`
    }
    ensureScript(t.customJsEnabled, t.skeletonVersion)
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
