# Theming

Razzoozle ships a manager-driven theming engine. Open `/manager` → the **Design** tab.

## What you can change

- **Colors** — primary, secondary, accent, text, and the four answer-tile colors (kept color-blind-safe). Plus game-specific tokens for teams, tiers, state (correct/wrong), rank (up/down), timer, streak, and footer.
- **Backgrounds** — a separate image per view (auth / manager game / player game), each with a scrim overlay.
- **Logo and app title.**
- **Animated backgrounds** — backdrop type (cream, none), animation speed, intensity, and floating icon count.
- **Animation timing** — spring stiffness, damping, duration scale, and stagger scale.
- **Sounds** — custom audio for music tracks and event cues.

Changes preview live and apply via CSS custom properties — the whole UI recolours, no rebuild.

## Templates

Save your own theme templates and restore them at any time. Two example templates ship in the config:

- **Violet preset** — vibrant purple and cyan.
- **Südhang** — the flat purple default.

Templates are stored as JSON files and can be imported, exported, and managed through the Design tab's template card.

## Local AI imagery

With the AI provider set to **local ComfyUI** (Z-Image), generate question and theme imagery on-device — no external service, keys stay server-side. Generated images are stored as WebP under the media volume.
