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
- `role="toolbar"` am footer
- `aria-label="Kompakte Spielsteuerung"` via `manager:aria.actionFooterCompact`
- Toggle-Actions rendern `aria-pressed`
- Per-Action-Buttons haben `aria-label` + `title`

### Safe-Area
`pb-[env(safe-area-inset-bottom)]`

### Reduced-Motion
`motion-reduce:transition-none` (in IconBarButton)

### Single-Instance-Constraint
ActionFooterHost-Registry erlaubt nur 1 Footer pro Tab (`action-footer-host-context.tsx:99`). Compact-Variante darf NICHT parallel zu Default-Variante auf demselben Tab laufen.

### Sample-Tab
`users` Tab (`ConfigUsers`) — ActionFooter hat nur eine "Create user"-Action (Plus-Icon), keine inline Config-Controls im Footer.
