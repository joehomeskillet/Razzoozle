# SettingRow API Specification

**Document:** Spec für eine konsolidierte SettingRow-Komponente zur Vereinheitlichung wiederholter Einstellungs-UI über Manager-Config-Seiten.

**Status:** Architektur-Spec für WP2/WP5 (nicht produktiv bis nach WP0-Review).

**Geltungsbereich:** `packages/web/src/features/manager/components/console/` oder `packages/web/src/components/manager/`.

---

## 1. Props-Interface (TypeScript)

```typescript
export interface SettingRowProps {
  /**
   * Visible setting title (left column on wide, top on mobile).
   * No duplicated field labels; the control prop handles its own accessible name if needed.
   */
  title: string

  /**
   * Optional muted description line under title.
   * Remains visually connected to title/control on all viewports.
   */
  description?: string

  /**
   * Control slot — accepts Input, Select, ToggleField, RadioGroup or other form control.
   * SettingRow handles outer alignment; control manages its own `id`, `aria-label`, etc.
   */
  children: ReactNode

  /**
   * Optional badge signal that the setting requires a game/app restart to take effect.
   * Example text: "Neustart erforderlich".
   */
  restartBadge?: boolean

  /**
   * Optional status message (validation error, success, pending save).
   * Example: "Gespeichert" (green), "Fehler beim Speichern" (red), "Wird gespeichert…" (gray).
   * Displays below the control row, above description.
   */
  statusMessage?: {
    text: string
    tone: "success" | "error" | "pending"
  }

  /**
   * Disable the control row (disables nested control if it supports disabled prop).
   */
  disabled?: boolean

  /**
   * Reason text shown in a tooltip or small inline message when disabled.
   * Example: "Nur verfügbar wenn Text-Provider konfiguriert".
   * Do not include if disabled reason is obvious from context.
   */
  disabledReason?: string

  /**
   * Optional `id` attribute for the row container (used by sticky form actions to focus/scroll).
   */
  id?: string

  /**
   * Optional className for responsive width/padding adjustments only.
   * Do not restyle hairline borders, radius, or colors.
   */
  className?: string
}
```

---

## 2. Ref-Forwarding

```typescript
const SettingRow = forwardRef<HTMLDivElement, SettingRowProps>(
  ({ title, description, children, restartBadge, statusMessage, disabled, disabledReason, id, className }, ref) => {
    // Implementation
  }
)

SettingRow.displayName = "SettingRow"
export default SettingRow
```

**Wofür:** Fokus-Restauration nach Dialog-Schließung; sticky `ActionFooter` scrollt zur letzten Einstellung durch Ref-Sammlung.

**Wie:** Parent-Komponente sammelt SettingRow-Refs in einem Array, bei Fokus-Bedarf aufrufen auf `ref.current?.focus()` oder `ref.current?.scrollIntoView({ behavior: "smooth" })`.

---

## 3. Responsive Layout

| Breakpoint | Layout |
|---|---|
| `sm` (640px) und breiter | **Horizontal:** Title (fixed `sm:w-40`, shrink-0) + Control rechts (flex-1). Description unter der ganzen Zeile, Links-indentiert (sm:pl-44, zur Title-Breite). |
| Unter `sm` | **Gestapelt:** Title oben (volle Breite). Control darunter. Description gestapelt. Restarts/Fehler zwischen Control und Description. |

**Klassen-Muster** (analog zu LabelRow/ToggleField):
- Outer: `flex flex-col gap-1`
- Title-Zeile: `flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4`
- Title: `shrink-0 text-sm font-medium text-[var(--ink-muted)] sm:w-40 sm:py-2.5 flex items-center min-h-11` (44px touch-target)
- Control-Wrapper: `flex min-h-11 flex-1 items-center gap-2` (auf SM+)
- Description/Fehler: `text-xs text-[var(--ink-subtle)] sm:pl-44`

---

## 4. ARIA-Verkabelung

```typescript
// Beispiel-Struktur:
<div id="setting-row-team-mode" ref={ref} className="flex flex-col gap-1">
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
    <label htmlFor="control-team-mode" className="…">
      Team-Modus
    </label>
    <div className="flex min-h-11 flex-1 items-center">
      {/* Control mit aria-labelledby + aria-describedby */}
      <ToggleField
        id="control-team-mode"
        aria-labelledby="setting-row-team-mode-title"
        aria-describedby={clsx(
          "setting-row-team-mode-desc",
          statusMessage && "setting-row-team-mode-status"
        )}
        aria-invalid={statusMessage?.tone === "error"}
        // …
      />
    </div>
  </div>

  {statusMessage && (
    <p id="setting-row-team-mode-status" className="text-xs" role="status" aria-live="polite">
      {statusMessage.text}
    </p>
  )}

  {description && (
    <p id="setting-row-team-mode-desc" className="text-xs text-[var(--ink-subtle)] sm:pl-44">
      {description}
    </p>
  )}
</div>
```

**Regeln:**
- Title/Label `htmlFor` zeigt auf Control-`id`.
- Control erhält `aria-labelledby="…-title"` + `aria-describedby="…-desc …-status"` (beide bei Bedarf).
- Status-Nachricht kriegt `role="status"` + `aria-live="polite"` für Screening-Reader-Ankündigung.
- Bei `statusMessage.tone === "error"`: `aria-invalid="true"` auf dem Control.

---

## 5. Zusammenspiel mit ActionFooter (Sticky Save-Bar)

**Dirty-State-Konvention:**
- Parent (z.B. ConfigGameMode) verwaltet `isDirty` (mindestens ein Feld geändert, aber nicht gespeichert).
- `ActionFooter` zeigt:
  - Primary Button "Speichern" (enabled nur wenn `isDirty`).
  - Secondary Button "Verwerfen" oder "Standardwerte" (label je nach Kontext, siehe unten).
- **Nach Speichern:** `isDirty` auf false setzen; jedes SettingRow kann optional einen kurzen `statusMessage.tone="success"` anzeigen.

**Reset-Wording (SDD §5.12):**
- **„Verwerfen"** – unsaved local edits zurücksetzen auf letzten Server-State.
- **„Voreinstellungen wiederherstellen"** – Presets (z.B. Modus-Templates) laden.
- **„Auf Standardwerte zurücksetzen"** – factory defaults (die gesamte Anwendung).

Parent kann `ActionFooter` diese Labels mitgeben; SettingRow hat keine direkte Abhängigkeit davon.

---

## 6. Usage-Beispiele (Markup-Skizzen)

### Beispiel 1: ToggleField-Fall (aus ConfigGameMode)

```tsx
// Nicht lauffähig, nur Struktur-Demonstr.

<SettingRow
  id="team-mode-setting"
  title="Team-Modus"
  description="Spieler wählen ein Team (Rot / Blau / Grün / Gelb). Erfordert Neustart des Spiels."
  restartBadge={true}
  statusMessage={isSaving ? {
    text: "Wird gespeichert…",
    tone: "pending"
  } : null}
  disabled={isSaving}
>
  <ToggleField
    id="team-mode-toggle"
    label="Team-Modus aktivieren"
    checked={teamMode}
    onChange={handleToggle}
    disabled={isSaving}
  />
</SettingRow>
```

**Hinweis:** ToggleField hat ein eigenes `label` Prop, das das `aria-label` der Button setzt; SettingRow verdoppelt dies nicht.

### Beispiel 2: Input-Fall (aus ai/TextProviderSection)

```tsx
// Nicht lauffähig, nur Struktur-Demonstr.

<SettingRow
  id="ai-temperature-setting"
  title="Temperatur"
  description="Beeinflußt die Kreativität: 0 = deterministisch, 1 = sehr variabel."
  statusMessage={validationError
    ? { text: `Fehler: ${validationError}`, tone: "error" }
    : successMsg
    ? { text: "Gespeichert", tone: "success" }
    : null
  }
  disabled={isSaving || selectedProvider?.status === "offline"}
  disabledReason={selectedProvider?.status === "offline" ? "Provider offline" : undefined}
>
  <Input
    id="ai-temperature-input"
    type="number"
    min="0"
    max="1"
    step="0.1"
    value={temperature}
    onChange={(e) => updateTemperature(parseFloat(e.target.value))}
    disabled={isSaving}
  />
</SettingRow>
```

---

## 7. Migrations-Notiz

**Kandidaten für SettingRow-Migrierung:**

1. `ConfigGameMode.tsx` — 7 `ToggleField` + 1 `RadioGroup` mit Descriptions → 8 SettingRows.
2. `ai/TextProviderSection.tsx` — 4 `LabelRow` + `Input` mit Descriptions → 4 SettingRows.
3. `ConfigDesign.tsx` (TBD) — ähnliches Muster.

**Grep-Ergebnis (aktuell):**
```bash
# LabelRow-Nutzungen im Manager-Scope
find packages/web/src/features/manager -name "*.tsx" -exec grep -l "LabelRow\|ToggleField" {} \;
# Ergebnis: ~12 Dateien (nach SDD §3 Audit zu zählen)

# SettingRow-Kandidaten nach Häufigkeit (wird WP0-Audit liefern)
```

**API-Kompatibilität:**
- `LabelRow` und `ToggleField` bleiben unverändert.
- SettingRow ist ein **additives** Compositing-Primitive (kombiniert beides).
- Keine bestehenden Call-Sites werden gebrochen.
- Migration kann Seite für Seite erfolgen (erst eine ConfigGameMode-Section, dann nächste).

---

## 8. Design-Konventionen (design.md §8·B)

- **Farben:** `--ink-muted` für Title, `--ink-subtle` für Description (beide existierende Tokens).
- **Status-Töne:** `success` → `--state-correct` grün; `error` → `--state-wrong` rot; `pending` → `--surface-muted` grau.
- **Radius:** `rounded-[var(--radius-theme)]` für Status-Badge (falls als Chip gerendert).
- **Focus:** `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]` auf der Control-Wrapper.
- **Keine Duplikate:** Bestehende `--shadow-flat`, `--border-hairline`-Tokens nutzen, nicht neu erfinden.

---

**Approval Gate:** Diese Spec wartet auf WP0-Review + UX-Auditor Bestätigung, bevor Implementation in WP2 / WP5 beginnt.
