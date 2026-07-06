import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"

// Match the server's hard cap in saveBackgroundImage so we reject oversized
// files client-side before pushing megabytes over the socket. AssetPreview
// also guards client-side; this stays as a second line of defence.
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

// The kind of theme operation currently awaiting a server response. THEME_ERROR
// carries no slot/context, so we track the last action explicitly to route the
// failure (and clear the right pending state) instead of guessing from
// pendingSlot, which can misattribute a save error to an in-flight upload slot.
export type ThemeAction = "upload" | "save" | "template"

// Registry-driven token pickers (contract §10). The two cards below render every
// THEME_TOKENS entry as a color input bound to its dot-path; grouping the doc's
// five `group`s into two cards keeps the editor compact. Order within a card
// follows THEME_TOKENS so it matches the SKELETON.md doc + applyTheme loop.
export const TOKEN_CARDS: Array<{
  /** Stable i18n suffix + dev-default heading. */
  key: string
  defaultTitle: string
  /** THEME_TOKENS `group` values rendered in this card, in order. */
  groups: string[]
}> = [
  {
    key: "teamsTiers",
    defaultTitle: "Teams & Tiers",
    groups: ["Teams", "Tiers"],
  },
  {
    key: "statesMisc",
    defaultTitle: "States & Misc",
    groups: ["State", "Rank", "Misc"],
  },
]

// Read a dot-path (e.g. "footerColors.bg") off a Theme, falling back to the
// default so a shallow-merged partial nested object still yields a string.
export const getTokenColor = (theme: Theme, path: string): string => {
  const read = (obj: unknown): unknown =>
    path
      .split(".")
      .reduce<unknown>(
        (o, k) => (o as Record<string, unknown> | null | undefined)?.[k],
        obj,
      )
  const value = read(theme)

  return typeof value === "string" ? value : (read(DEFAULT_THEME) as string)
}
