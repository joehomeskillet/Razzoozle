# Listen-Konsolidierung — Design-Meinung (W3-0)

**Ziel:** Konsistente Row-Density, Metadaten-Slots, Aktions-Reihenfolge + Bulk-Toolbar-Muster über die 5 Listen (Quiz, Ergebnisse, Running Games, Klassen, Play/SelectableRow).

**Status:** Design-Audit-Meinung für WP3 Implementation.

---

## 1. Row-Dichte-Standard: 44px Touch-Target, Einheitliche Padding-Rhythmen

**Standard-Höhe:** `min-h-11` (44px) auf der **Haupt-Zeile** (title + meta) je ListRow-Instanz. Diese Höhe ist bereit implementiert (ListRow.tsx Zeile 112).

**Padding-Standard:**
- **Outer:** `p-4` (16px, alle 4 Seiten) auf dem Row-Container (ListRow.tsx Zeile 108).
- **Inner:** `gap-3` zwischen Icon/selection + Content + Actions (ListRow.tsx Zeile 112, 131).
- **Footer:** `mt-3 w-full` für Second-line-Slots wie Label-Chips (ListRow.tsx Zeile 162).

**Token-Klassen (design.md §8·B konform):**
```
Title:      font-semibold text-[var(--ink)]
Meta:       text-sm text-[var(--ink-subtle)]
Actions:    text-[var(--ink-faint)] (idle), hover:text-[var(--ink-muted)]
Destructive: text-[var(--state-wrong)] (delete icons)
Leading:    text-[var(--ink-faint)] (shrink-0)
```

**Keine Varianten pro Seite:** Alle 5 Listen nutzen diese gleiche Höhe/Padding. Keine per-tab CSS-Overrides (z.B. `className="opacity-85"` auf Archived in QuizzList — das ist visuell-inkonsequent).

---

## 2. Metadaten-Slots pro Liste (Tabelle)

| Liste | title | meta | leading | footer | Höhe/Verhalten |
|---|---|---|---|---|---|
| **Quiz (aktiv)** | Quiz-Name | Fragenzahl (xs text) | ListChecks-Icon | Label-Chips + Zuweisen-Dropdown | Höhe 11, Selection-Checkbox + Actions sichtbar |
| **Quiz (archiv)** | Quiz-Name | Fragenzahl ODER "Archiviert" | ListChecks-Icon | *keine* | Höhe 11, KEIN Selection, Actions sichtbar |
| **Ergebnisse** | Quiz-Name | Datum + Zeit + Spieler-Zahl + Klasse-Badge | *keine* | *keine* | Höhe 11, KEIN Selection, Share-Action + Delete sichtbar |
| **Running Games** | Quiz-Name | PIN + Spieler-Zahl + Status ("Lobby"/"Läuft") + Host-Status | *keine* | *keine* | Höhe 11, KEIN Selection, TakeOver + End Actions sichtbar |
| **Klassen** | Klassen-Name | Schüler-Zahl | *keine* | Label-Chips (Fächer) | Höhe 11, KEIN Selection, Edit + Delete Actions sichtbar |
| **Play (SelectableRow)** | Quiz-Name | Fragenzahl | *keine* | *keine* | Höhe 11, RADIO-Semantik, KEIN Actions/Overflow |

**Regel:** meta darf **nicht leer sein** — falls kein Zusatz-Info vorhanden, NullState oder default-Text (z.B. "—"). Das verhindert visuelle Kollaps-Artefakte.

---

## 3. Aktions-Reihenfolge: Verbindlich nach SDD §4.5

**SDD-Canonical-Order:**
1. **open/view** (falls existiert)
2. **edit**
3. **duplicate/domain-spezifisch** (z.B. export, restore, takeover)
4. **overflow** (seltene oder gefährliche Sekundär-Aktionen)
5. **delete** (destructive, last, rott-Farbe)

**Umsetzung pro Liste:**

| Liste | Sichtbar | Overflow | Destruktiv |
|---|---|---|---|
| **Quiz (aktiv)** | edit, duplicate | *empty* | delete → overflow |
| **Quiz (archiv)** | edit, export, restore | *empty* | delete → overflow |
| **Ergebnisse** | share | delete | (delete sichtbar oder overflow — Konvention?) |
| **Running Games** | takeover | *empty* | end → sichtbar (destructive-Red) |
| **Klassen** | edit | *empty* | delete → sichtbar (destructive) |

**Anti-Pattern (Real-Audit):** QuizzList archived nutzt OverflowMenu **außerhalb** des ListRow (Lines 410-412) statt im `overflow` prop. **Standardisieren:** Immer Overflow-Actions via ListRow's `overflow` Prop (nicht extra-rendert).

---

## 4. Bulk-Toolbar-Muster: Synchronized mit ActionFooter

**Bulk-Toolbar-Sichtbarkeit:** Nur wenn ≥1 Row selected (Checkboxes in QuizzList).

**Layout (QuizzList als Referenz):**
- Toolbar rendert über die Liste (vor dem Grid/Map).
- Inhalt: Zahl ("5 ausgewählt") + Bulk-Action (z.B. "Löschen") + Cancel.
- **Design-Tokens:** `bg-[var(--surface-2)] px-3 py-2 rounded-lg outline-2 -outline-offset-2 outline-[var(--border-hairline)]`.

**Verhältnis zur ActionFooter:**
- ActionFooter ist **sticky bottom** für Save/Reset bei Dirty-State (WP1-F).
- Bulk-Toolbar ist **inline** (nicht sticky).
- **Keine min-h-0 auf Content-Container** wenn Bulk+ActionFooter gemeinsam → Layout kann sonst kollabieren (ConfigSelectQuizz Kommentar Zeile 180).

**Konsequenz:** Bulk-Delete / Bulk-Archive per ListRow.selection (Checkbox) + Toolbar-Trigger, keine separate Selection-Bar-Komponente.

---

## 5. Anti-Regeln: Was NICHT tun

1. **Keine neuen Row-Varianten:** LabelRow/ToggleField bleiben für Settings. ListRow ist EINZIGE List-Row-Komponente (außer SelectableRow für Radio).
2. **Keine Karten-Rückfälle:** Oversized Cards (alt-Muster) sind vorbei. Alle 5 Listen nutzen ListRow (flache, kompakte Struktur).
3. **Kein SelectableRow-Umbau:** Play/ConfigSelectQuizz nutzt SelectableRow (Radio-Semantik) mit `selected` Boolean. Keine Checkbox-Konvertierung.
4. **Keine Opacity-Hacks:** `className="opacity-85"` auf Archived (QuizzList Line 407) → entfernen. Statt visuelles Dimmen: explizite Status-Badge (z.B. "Archiviert" im meta-Text).
5. **Keine Payload-Duplication:** Aktions-Handler bleiben kompakt (onClick nur der Aktion). Keine 3+-Zeiler Arrow-Funktionen im `actions` Array.

---

## Markup-Pseudo: Medien als Hybrid-Referenzfall

```jsx
// Quasi-Code: zeigt Struktur, nicht lauffähig.

{/* Bulk-Toolbar (nur wenn >0 selected) */}
{selected.size > 0 && (
  <div role="toolbar" className="flex items-center gap-2 bg-[var(--surface-2)] px-3 py-2 rounded-lg">
    <span className="text-sm font-semibold">{{count}} ausgewählt</span>
    <Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
      Löschen
    </Button>
  </div>
)}

{/* Row-Grid */}
{items.map(item => (
  <ListRow
    key={item.id}
    selection={
      <Checkbox
        checked={selected.has(item.id)}
        onChange={() => toggleSelect(item.id)}
      />
    }
    title={item.name}
    meta={
      <span className="text-xs">
        {item.sourceLabel} · {item.owner} · {item.updatedAt}
      </span>
    }
    actions={[
      { key: "info", icon: Info, label: "Details", onClick: () => openInfo(item) },
      { key: "download", icon: Download, label: "Herunterladen", onClick: () => ... },
    ]}
    overflow={<OverflowMenu actions={[...]} />}
  />
))}
```

**Merke:** `selection` (Checkbox) + `actions` (visible + overflow) immer zusammen; `meta` trägt Kontext + Ownership-Info; `footer` nur wenn Labels existieren.

---

## Zusammenfassung (5 Bullets)

1. **Dichte-Standard:** `min-h-11`, `p-4`, `gap-3` auf alle 5 Listen — keine opacity-Hacks, keine per-tab Varianten. Touch-Targets ≥44px konsistent.

2. **Metadaten-Slots:** Tabelle zeigt title/meta/leading/footer je Liste — keine leeren meta-Slots (→ visual collapse). footer nur für Label-Chips (Quiz, Klassen).

3. **Aktions-Order:** SDD §4.5 canonical (open → edit → domain → overflow → delete). ListRow `overflow` Prop nutzen (nicht extra-rendert wie in archived-QuizzList).

4. **Bulk-Toolbar:** Inline (nicht sticky), zeigt Zahl + Aktion + Cancel. Nur sichtbar wenn ≥1 selected. Layout-Konflikt mit ActionFooter vermeiden (kein min-h-0 auf Content).

5. **Anti-Regeln:** Keine Row-Varianten (ListRow einzige), keine Karten-Rückfälle, SelectableRow bleibt Radio, keine Opacity-Dimmer, keine Payload-Duplication.

---

**Design-Konformität:** design.md §8·B (Tokens: --ink, --ink-subtle, --ink-faint, --state-wrong, --surface, --border-hairline). ListRow + SelectableRow + OverflowMenu sind bestehende, bewährte Primitives — keine Neu-Erfindungen.

**Umsetzungs-Gate:** WP3 implementiert eine Liste nach der anderen (Spielen → Running → Ergebnisse → Quiz → Klassen), Tests/E2E nach jeder List-Migrierung.
