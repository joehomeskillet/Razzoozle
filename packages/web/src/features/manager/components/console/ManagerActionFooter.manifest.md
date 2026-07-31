# ManagerActionFooter — UI/UX-Manifest

## Zweck

`ManagerActionFooter` ist das verbindliche Shell-Band für Live-Spielaktionen in der Manager-Oberfläche. Es bündelt Auto-Modus, Frage überspringen, Lösung anzeigen und die Timer-Schritte in einer stabilen, durchgehenden Leiste. Socket-Ereignisse bleiben außerhalb der Komponente: Die aufrufende Page reicht typisierte Callbacks durch.

## Layout und Spacing

- Das Element ist ein direktes Kind des `ConsoleShell`-Tabpanels und nutzt `sticky` am unteren Rand.
- `-mx-4 -mb-4` beziehungsweise `sm:-mx-6 sm:-mb-6` gleichen das Tabpanel-Padding aus. Dadurch reicht das Band über die gesamte Content-Breite bis an den Shell-Rand.
- Die Leiste ist auf kleinen Viewports vertikal gestapelt und ab `sm` horizontal geteilt: Status links, Aktionen rechts.
- Action-Buttons bleiben mit `min-h-11` mindestens 44 CSS-Pixel groß. Der Safe-Area-Abstand am unteren Rand berücksichtigt mobile Geräte mit Home-Indikator.
- Team-Chips dürfen horizontal scrollen, während die Aktionsgruppe umbrechen darf. Kein Inhalt wird unter dem Band abgeschnitten; die ConsoleShell-Scrollfläche liefert das passende `scrollPaddingBottom`.

## Tokens und Komponenten

- Oberfläche: `--footer-bg`, `--footer-text`, `--surface-2` und `--line`.
- Primär-/Aktivzustand: `bg-accent-tint`, `text-accent-contrast`, `bg-accent-contrast`.
- Verbindungszustände: `bg-status-online-bg`/`text-status-online-text`, `bg-status-offline-bg`/`text-status-offline-text` und `bg-status-pending-bg`/`text-status-pending-text` über `StatusBadge`.
- Aktionen verwenden die bestehende `Button`-Komponente; Lucide-Symbole sind dekorativ (`aria-hidden`). Es gibt keine neuen Dependencies und keine hartcodierten Farben.

## Verhalten und A11y

- Auto-Modus ist ein echter Toggle mit `aria-pressed`; kontrollierte Nutzung erfolgt über `autoMode` und `onAutoModeChange`, alternativ über `defaultAutoMode`.
- Alle Aktionen sind native Buttons, haben sichtbare Beschriftungen, `aria-label` und `title`. Die bestehende `Button`-Komponente stellt `:focus-visible`-Ringe bereit.
- Die Timer-Gruppe ist als `role="group"` beschriftet. Team-Status werden als Liste mit sichtbarem Text und zusätzlichem Status-Badge ausgegeben.
- Keine automatisch laufende Animation. Die Schalterbewegung animiert nur `transform`; `motion-reduce:transition-none` deaktiviert diese Übergänge bei `prefers-reduced-motion`.
- Die Reihenfolge ist auf jedem Viewport konstant: Auto, Überspringen, Auflösen, Zeit verringern, Zeit erhöhen.

## Mount-Strategie

Der Mount erfolgt im Live-Manager-View des `GameWrapper` (`manager=true`, `controls=true`) als Ersatz für die verstreuten Presenter-Toolbar-Aktionen. Die Manager-Page verbindet die fünf Action-Callbacks mit den autorisierten `EVENTS.MANAGER`-Socket-Events und liefert die Team-Statusliste. Statische Konfigurationsseiten im `ConsoleShell` mounten das Band nicht, da dort keine Live-Spielaktionen verfügbar sind.

Bis zur Wiring-Welle bleibt die Komponente presentational und ist über den Console-Barrel exportiert. Der Footer darf nur als direkter Tabpanel-Flex-Sibling montiert werden; Content-Siblings verwenden kein `min-h-0`, damit `position: sticky` erhalten bleibt.
