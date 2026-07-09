# Razzoozle — build conventions (read before styling anything)

## Setup — nothing to wrap
No provider is required. The bundle self-initializes i18next (English) at load, so components like `AlertDialog` render real labels. Fonts (Rubik) ship with the bundle. Two page-level rules:

1. Set the page background to the cream field: `background: var(--color-field-cream)` (`#F4F1EA`). This app is a flat "cream" design — never dark surfaces or glass/`backdrop-filter`.
2. If you build an in-game screen, set `--game-fg: #0E1120` on your top-level container. Several game components read `var(--game-fg)` for text; its default is white and renders invisible on cream.

## Styling idiom — CSS custom properties, NOT new utility classes
The shipped stylesheet is the app's **compiled** Tailwind output: only class names the app already uses exist in it. There is no Tailwind compiler at design time — **an invented utility class (`bg-teal-500`, `p-7`, …) silently does nothing.** Style your own layout glue with inline styles or plain CSS using the design tokens:

| Token | Use |
|---|---|
| `--color-primary` | violet brand, primary CTA fills (white text OK on it) |
| `--color-secondary` | dark ink headings |
| `--color-accent` | runtime accent (amber by default) — use ink text on accent fills, never white |
| `--color-field-cream` / `--color-field-ink` | page fields: cream front-of-house, ink stage |
| `--surface` | card/panel surface (white) |
| `--border-hairline` | 1px hairline borders/rings on tiles and cards |
| `--shadow-flat` | the flat design's only shadow |
| `--game-fg` | in-game foreground text (set it on your shell, see above) |
| `--radius-theme` | themeable corner radius |

Contrast rules that fail review if broken: ink text (not white) on accent/green/red/gold fills; every answer-tile-like surface carries `border: 1px solid var(--border-hairline)`.

## Where the truth lives
Read `styles.css` and its import `_ds_bundle.css` (tokens + compiled component CSS) before styling; `fonts/fonts.css` lists the shipped Rubik faces. Each component's API is its `<Name>.d.ts`; usage examples are in its `.prompt.md`.

## Idiomatic build snippet
```jsx
import { Button, Card, PinInput } from "@razzoozle/web"

export default function JoinScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-field-cream)", display: "grid", placeItems: "center" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-hairline)", borderRadius: 16, boxShadow: "var(--shadow-flat)", padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ color: "var(--color-secondary)", fontWeight: 700, fontSize: 24 }}>Join the game</h1>
        <PinInput value="4291" onChange={() => {}} />
        <Button variant="primary" size="lg">Join</Button>
      </div>
    </div>
  )
}
```
Compose library components for controls; write your own glue sparingly and only with the tokens above.
