# Theming

Razzoozle ships a manager-driven theming engine. Open `/manager` → the **Design** tab.

## What you can change
- **Colours** — primary, secondary, accent, text, and the four answer-tile colours (kept colour-blind-safe).
- **Backgrounds** — a separate image per view (auth / player / projector).
- **Logo, app title, corner radius, background scrim.**
- **Style: Flat ⇄ Glass** — a toggle between the flat baseline and the liquid-glass (frosted, blurred) variant.

Changes preview live and apply via CSS custom properties — the whole UI recolours, no rebuild.

## Presets
Two presets ship built-in:
- **Razzoozle Violet** — the violet liquid-glass signature look.
- **Südhang (default)** — the flat baseline.

Save your own presets and restore previous versions from the revision history.

## Liquid glass
The glass variant is opt-in (`style: "glass"`) and scoped so the flat theme renders identically to before. It adds frosted, blurred surfaces with graceful fallbacks for `@supports not (backdrop-filter)`, `prefers-reduced-transparency`, and `prefers-reduced-motion`.

## Local AI imagery
With the AI provider set to **local ComfyUI** (Z-Image), generate question and theme imagery on-device — no external service, keys stay server-side. Generated images are stored as WebP under the media volume.
