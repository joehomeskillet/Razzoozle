import type { Theme } from "@razzoozle/common/types/theme"

// Immutably set a dot-path on a Theme, cloning every object level on the way
// down (mirrors the nested `backgrounds`/`teamColors` spread updates already in
// this file) so existing sibling keys are preserved and React sees new refs.
export const setTokenColor = (theme: Theme, path: string, hex: string): Theme => {
  const keys = path.split(".")

  const assign = (
    obj: Record<string, unknown>,
    i: number,
  ): Record<string, unknown> => {
    const key = keys[i] as string

    if (i === keys.length - 1) {
      return { ...obj, [key]: hex }
    }

    const child = obj[key]

    return {
      ...obj,
      [key]: assign(
        (child && typeof child === "object" ? child : {}) as Record<
          string,
          unknown
        >,
        i + 1,
      ),
    }
  }

  return assign(
    theme as unknown as Record<string, unknown>,
    0,
  ) as unknown as Theme
}
