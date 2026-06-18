// Manager-authored CSS for the animated backdrop is broadcast to every client,
// so strip the real injection vectors as defense-in-depth: a "</style" breakout
// (→ <script>) and @import (external loads). The value is rendered as TEXT
// children of a <style> element (never dangerouslySetInnerHTML), so the browser
// treats it as the style element's textContent and cannot re-parse it as HTML.
export const sanitizeAnimatedCss = (css: string | undefined | null): string => {
  if (!css) return ""
  if (/<\/style/i.test(css)) return "" // breakout attempt → drop entirely
  return css.replace(/@import[^;]*;?/gi, "") // no external stylesheet loads
}
