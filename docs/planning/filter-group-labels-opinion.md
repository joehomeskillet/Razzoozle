# Filter-Gruppen-Labels — Design-Meinung (W2-C)

**Problem:** Mehrere Manager-Tabs (Medien, Katalog, Quiz, Vorschläge) zeigen 2–3 gestapelte Reihen von FilterPill-Gruppen. Jede Reihe beginnt mit einem kontextlosen "Alle"-Pill. Live-Audit + Screenshots (wp0-shot-media-1440.png, wp0-shot-medien-390.png) zeigen: **"Alle / Alle / Alle" ohne Gruppenkontext** (real: Quelle, Sichtbarkeit, Fächer).

**Aktueller Code:** ConfigMedia.tsx nutzt bereits `role="group"` + `aria-label` (Quelle, Sichtbarkeit), aber diese Labels sind **nicht visuell sichtbar** — nur im A11y-Baum vorhanden.

---

## Kernmeinung: Visuell sichtbare Gruppenlabels

### 1. Label-Stil & Platzierung (Primary)

**Empfehlung: Kleine Text-Labels links vor den Pills auf wide (≥sm), oben gestapelt auf mobile.**

**Begründung:**
- Auf 1440px ist Platz für Labels neben den Pills (wie PageHeader-Subtitles).
- Orientierungssignal sofort erkannt ("Quelle:", nicht gerade "Alle" gelesen).
- Analog zu FormSection-Titeln (bestehende Konvention im Manager).
- Auf 390px wird es eng → Label oben, Pills darunter (gestapelt wie FormSection auf mobile).

**Styling (design.md §8·B konform):**
```
text-xs font-medium text-[var(--ink-subtle)] 
```
Muted Tone wie die bestehenden Descriptions, konsistent mit LabelRow/FormSection-Patterns. Kein Extra-Color-Token nötig.

---

### 2. Responsive Verhalten

| Breakpoint | Layout |
|---|---|
| `sm` (640px+) | Label **vor** Pills, horizontal: `flex flex-row items-center gap-3`. Label shrink-0 (`w-min`), Pills flex-wrap darunter. |
| Mobil (<640px) | Label **oben**, Pills darunter, beide volle Breite. `flex flex-col gap-1.5`. |

**Pixel-Beispiel (1440px):** "Quelle:" (muted label, 40px width) + Pills "Alle | Hochgeladen | KI | Design" (rest der row).

**Pixel-Beispiel (390px):** "Quelle" (oben) über den Pills "Alle | Hochgeladen | KI | Design" (gestapelt).

---

### 3. A11y: Keep `role="group"` + `aria-label`, Render Optional

**Struktur (keine Änderung an bestehender A11y):**
```jsx
<div role="group" aria-label="Quelle" className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
  <label className="text-xs font-medium text-[var(--ink-subtle)] shrink-0 sm:w-min">
    Quelle
  </label>
  <div className="flex flex-wrap items-center gap-2">
    {/* FilterPills */}
  </div>
</div>
```

**Regelwerk:**
- `role="group"` bleibt erhalten (Screening-Reader faßt Pills als Gruppe).
- `aria-label="Quelle"` bleibt erhalten (redundant mit visuellem Label, aber Standards-konform).
- Visuelles Label ist ein semantisches `<label>` (noch klarer für Automation).
- Keine neue A11y-Last, nur Sichtbarmachung des bestehenden Musters.

**Alternative (fieldset):** Nicht empfohlen — FilterPill ist kein formales Input, fieldset wäre semantisch falsch.

---

### 4. "Alle"-Pill: Generisch halten, Label macht es klar

**Empfehlung: Label generisch "Alle", ändert sich nicht pro Gruppe.**

**Begründung:**
- Mit visuellem Gruppenlabel ("Quelle:") ist "Alle" eindeutig → "Alle Quellen".
- Pill-Text kurz halten (UX-Best-Practice für mobile Pills).
- Ändern zu "Alle Quellen" wäre doppelte Labeling, erschwert i18n.
- Screening-Reader arbeitet sowieso mit aria-label + visuellen Labels zusammen.

**Beispiel-Text bleibt:** manager:media.filters.all = "Alle" (nicht "Alle Quellen").

---

### 5. Markup-Pseudo für Medien-Referenzfall

```jsx
// Gruppe 1: Quelle (Scope: Uploaded, AI, Design)
<FilterGroup label={t("manager:media.filters.label", { defaultValue: "Quelle" })}>
  {sourceFilters.map(entry => (
    <FilterPill key={entry.key} active={...} onClick={...}>
      {entry.label}
    </FilterPill>
  ))}
</FilterGroup>

// Gruppe 2: Sichtbarkeit (Scope: Own, Global)
<FilterGroup label={t("manager:media.scope.label", { defaultValue: "Sichtbarkeit" })}>
  {scopeFilters.map(entry => (
    <FilterPill key={entry.key} active={...} onClick={...}>
      {entry.label}
    </FilterPill>
  ))}
</FilterGroup>

// Gruppe 3: Fächer (LabelFilterPills)
<LabelFilterPills ... />
```

**Neue Komponente (optional):** Ein Wrapper `<FilterGroup label>` könnte den Label + flex/responsive Logic kapseln. Ggfs. für WP2 schaffen, falls 3+ Tabs das Pattern wiederholen.

---

## Zusammenfassung (5 Bullets)

1. **Label-Sichtbarkeit:** Kleine `text-xs font-medium text-[var(--ink-subtle)]` Labels links vor Pills (sm+), oben auf mobil (analog FormSection-Pattern).
2. **Responsive:** flex-row mit Label-shrink auf wide, flex-col gestapelt auf mobile (≈ 640px breakpoint).
3. **A11y ist safe:** `role="group"` + `aria-label` bleibt; visuelles Label macht es redundant aber sichtbar (keine neuen Regeln nötig).
4. **"Alle"-Pill:** Bleibt generisch; Gruppenlabel macht Kontext klar (kein "Alle Quellen"-Text nötig).
5. **Markup-Struktur:** FilterGroup-Wrapper (optional new component für WP2) oder inline `<div role="group" aria-label> + <label> + Pills`.

---

**Design-Konformität:** design.md §8·B (Token: --ink-subtle, --ink-muted, keine neuen Colors). Konsistent mit PageHeader Subtitles, FormSection Titles, LabelRow Descriptions.

**Umsetzungs-Gate:** WP2-C ist eine **Design-Audit-Meinung**; Implementation folgt in WP2-C nach dieser Vorgabe.
