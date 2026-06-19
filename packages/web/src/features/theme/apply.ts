import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import { THEME_TOKENS } from "@razzoozle/common/theme-tokens"
import { themeValidator } from "@razzoozle/common/validators/theme"
import type { RazzoozleGlobal } from "@razzoozle/web/features/manager/plugins/host"

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
  // Shallow-merge top-level fields, but deep-merge `animation`: a partial nested
  // object (e.g. only springStiffness from an old theme.json) would otherwise
  // replace the whole block and leave springDamping/scales undefined, which
  // flows into useReveal as `stiffness: undefined`. Backfill from DEFAULT_THEME.
  const t: Theme = {
    ...DEFAULT_THEME,
    ...theme,
    animation: { ...DEFAULT_THEME.animation, ...theme.animation },
  }
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

  // Front-of-house cream field + ink-on-accent tokens (Wave 1). These are
  // optional on the served theme: only override when present, otherwise the
  // index.css :root defaults (cream #F4F1EA / ink #0E1120) stand. Read via an
  // indexed view so this stays tsc-clean whether or not the Theme type declares
  // the fields yet, and never crashes if a partial/old theme.json omits them.
  const opt = t as unknown as Record<string, unknown>
  const setOptional = (cssVar: string, value: unknown) => {
    if (typeof value === "string") style.setProperty(cssVar, value)
  }
  setOptional("--color-field-cream", opt.colorFieldCream)
  setOptional("--color-field-ink", opt.colorFieldInk)
  setOptional("--accent-contrast-text", opt.accentContrastText)

  // Registry loop — the 1:1 color tokens (teams, tiers, state, rank, misc). The
  // derived vars (-ring/-text/-glow/-soft/--timer-track) track these via
  // color-mix in index.css with zero JS. The `?? DEFAULT_THEME` fallback also
  // covers a shallow-merged partial nested object.
  for (const tok of THEME_TOKENS) {
    const v = get(t, tok.path) ?? get(DEFAULT_THEME, tok.path)
    if (typeof v === "string") style.setProperty(tok.cssVar, v)
  }

  // data-theme-style drives all glass CSS in index.css. The app is cream-flat
  // only now: the user-facing glass toggle was removed, so we always force "flat"
  // (a no-op against the gated glass rules) even if a persisted theme still holds
  // style: "glass". This guarantees the app can never get stuck in glass.
  document.documentElement.dataset.themeStyle = "flat"

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
      // Minimal documented global the skeleton JS can read. MERGE (never
      // reassign) so we preserve any registerTab/api fields the manager plugin
      // host (manager/plugins/host.ts) merged on — a full reassign here would
      // wipe them on every theme broadcast / save / preview slider drag. Shares
      // the RazzoozleGlobal shape with the host so both sides agree on the type.
      const w = window as unknown as { razzoozle?: RazzoozleGlobal }
      w.razzoozle = Object.assign(w.razzoozle ?? {}, {
        theme: t,
        skeletonVersion: t.skeletonVersion,
      })
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
    // only merge when it's a plain object, otherwise keep the pure default.
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return DEFAULT_THEME
    }

    // Backfill defaults first (so a partial/old theme.json keeps validating),
    // then run it through the zod validator instead of an unchecked
    // `as Partial<Theme>` cast. safeParse normalizes nested defaults and rejects
    // malformed values (bad hex, out-of-range numbers); on failure we fall back
    // to the bundled default rather than apply an invalid theme.
    const result = themeValidator.safeParse({ ...DEFAULT_THEME, ...parsed })

    return result.success ? result.data : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}
