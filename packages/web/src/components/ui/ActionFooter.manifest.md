# ActionFooter — UI/UX-Manifest

## Compact-Variante (ActionFooterCompact)

Wenn `TabDef.actionFooterVariant: 'compact'` gesetzt ist, mountet `ConsoleShell` statt des textuellen `ActionFooter` den icon-only `ActionFooterCompact`. Eigener Portal-Consumer über denselben `ActionFooterHost`-Mechanismus.

### Token-Mapping
- `--accent-tint` (hover/idle)
- `--accent-contrast` (active)
- `--accent-contrast-text` (active text)
- `--surface-2` (footer bg)
- `--line` (border-top)
- Status-Token-Familie (für optional leading)

### Touch-Targets
44 × 44 px (`min-h-11 w-11`)

### ARIA
- `role="group"` auf der Icon-Bar in `ActionFooterCompact` via `IconBarDock`
- `aria-label` via `aria.actionFooter` mit Fallback `"Page actions"`
- Toggle-Actions rendern `aria-pressed`
- Per-Action-Buttons haben `aria-label` + `title`

### Spieloptionen-Action (WP wp-bb4e80438e8c)
- Stabile Action-Kette: `play-copy`, `play-options`, `play-start`
- Feste Test-IDs: `play-copy-btn`, `play-options-btn`, `quizz-start-btn`
- `play-options` bleibt vor Quiz-Auswahl aktiv und erklärt die Optionen
- `play-options` nutzt denselben 44×44-Kompatibilitäts-Vertrag (`min-h-11 w-11`) wie andere Compact-Buttons
- Die sechs Einstellungen werden im Optionen-Panel angezeigt; keine Always-Visible FormSection im regulären Content

### Safe-Area
Im Host-Container (`ActionFooterHostSlot`): `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`
`ActionFooterCompact` nimmt dieses Verhalten nicht selbst mit.

### Reduced-Motion
`motion-reduce:transition-none` (in IconBarButton)

### Single-Instance-Constraint
ActionFooterHost-Registry erlaubt nur 1 Footer pro Tab (`action-footer-host-context.tsx:99`). Compact-Variante darf NICHT parallel zu Default-Variante auf demselben Tab laufen.

### Chrome Source-of-Truth
- Der einzige Gradient-Chrome bleibt `ACTION_FOOTER_GRADIENT_CLASS` im `ActionFooterHost` (`ActionFooterHost-Context`).
- `ActionFooterCompact` trägt selbst keine Header-/Gradient-Bindings außer Host-Props.

### Sample-Tab
`users` Tab (`ConfigUsers`) — ActionFooter hat nur eine "Create user"-Action (Plus-Icon), keine inline Config-Controls im Footer.
