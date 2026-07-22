# Razzoozle Manager – Follow-up SDD (2026-07-22)

**Quelle:** User-Spec, verbatim übernommen als Repo-Artefakt. Kanonisch für die
zweite Konsolidierungsrunde nach dem Manager-Redesign (#86 / Row-System).

**Repository:** `joehomeskillet/Razzoozle`
**Betroffene Live-Ansichten:**

- `https://rust.razzoozle.xyz/manager/config/gamemode`
- `https://rust.razzoozle.xyz/manager/config/users`
- `https://rust.razzoozle.xyz/manager/config/results`
- `https://rust.razzoozle.xyz/manager/config/classes`
- `https://rust.razzoozle.xyz/manager/config/students`
- `https://rust.razzoozle.xyz/manager/config/play`

**Ziel:** Gezielte zweite Konsolidierungsrunde nach dem bereits abgeschlossenen Manager-Redesign.
**Wichtig:** Kein erneuter globaler UI-Audit und keine komplette Neugestaltung. Der aktuelle Branch ist die Ausgangsbasis. Bearbeite ausschliesslich die unten beschriebenen Restprobleme und die dafür notwendigen gemeinsamen Komponenten, Backend-Funktionen, Datenbankänderungen, Übersetzungen und Tests.

---

# 1. Arbeitsmodus

Arbeite spec-driven und in kleinen, überprüfbaren Work Packages.

## 1.1 Vor dem Ändern

- Keine uncommitted Änderungen anderer Arbeiten überschreiben.
- Nicht auf `main` arbeiten.
- Den aktuellen Stand nicht durch Reset, Rebase oder Pull ersetzen.
- Zuerst die betroffenen Frontend-, Rust-, Datenbank-, Event- und Testdateien ermitteln.
- Bestehende Shared Components des letzten Redesigns wiederverwenden.
- Keine zweite parallele Komponentenfamilie einführen.

## 1.2 Kein neuer grosser Audit

Nur die Implementierungsmatrix: `docs/planning/manager-followup-implementation-matrix.md`
(Spalten: Ansicht | Aktuelle Dateien | Bestehende Shared Components | Backend/Event/DB | Geplante Änderung | Tests).
Danach direkt umsetzen. Keine erneute allgemeine Designanalyse aller Manager-Seiten.

## 1.3 Subagents

- Claude: Orchestrierung, Architektur, Endabnahme.
- Codex: Frontend-/Backend-Implementierung.
- Grok oder unabhängiger Codex-Agent: Diff-Review und Regressionssuche.
- Browser-QA-Agent: Playwright-/Stagehand-Prüfung.
- Accessibility-Review-Agent: Tastatur, Fokus, Labels, Dialoge, Mehrfachauswahl.

Der Implementierungs-Agent darf seine Änderungen nicht selbst final freigeben.

---

# 2. Bestehende Architektur respektieren

Vorhandene Komponenten haben Vorrang, insbesondere: ConsoleShell, PageHeader,
ListRow, SelectableRow, EmptyState, SectionCard, Button, Input, Badge,
FilterPill, AlertDialog, LabelFilterPills. Prüfen, ob aus der Medienverwaltung
bereits eine geeignete Auswahl- oder Bulk-Aktionslogik extrahiert werden kann.

## 2.1 Komponentenregel

Keine neuen Komponenten mit diesen oder sinngleichen Funktionen anlegen, ohne
zuerst die vorhandene Implementierung zu erweitern: EntityRow,
BulkSelectionToolbar, SelectionCheckbox, SettingsSection, SettingRow,
StatusBadge, ConfirmDialog. Eine neue gemeinsame Komponente ist nur zulässig,
wenn mindestens drei der betroffenen Ansichten dasselbe Muster benötigen.

## 2.2 Token- und UI-Gates

`bash scripts/check-manager-tokens.sh` muss bestehen. Keine lokalen
Neuinterpretationen von Primärfarbe, Radius, Schatten, Fokus-Ring,
Statusfarben, Danger-Stil, Buttonhöhen, Dialog-Overlay.

---

# 3. Gemeinsames Zielbild

## 3.1 Einstellungszeilen

Für `gamemode` und den Optionsbereich von `play`: einheitliches
Settings-Layout. Grid: Spalte 1 = Titel/Badge/Beschreibung (flexibel),
Spalte 2 = Control (feste/begrenzte Breite).

Verbindlich:
- Alle Switches in derselben vertikalen Control-Spalte.
- Titel und Beschreibung an derselben linken Kante.
- Beschreibung nicht als weit rechts versetzter Einzeltext.
- Switch/Radio-Gruppe/Select direkt ihrer Einstellung zugeordnet.
- Kleine Viewports: Control stapelt unter Titel+Beschreibung.
- Abschnittsabstände > Zeilenabstände.
- Neustart-Hinweis direkt beim Setting-Titel.

## 3.2 Mehrfachauswahl

Gemeinsames Muster für Nutzer, Ergebnisse, Klassen, Schüler:

1. Auswahl-Checkbox pro Zeile.
2. „Alle auswählen" oberhalb der Liste.
3. Tri-State (nichts / teilweise / alle im Auswahlbereich).
4. Ab 1 Auswahl: gemeinsame Bulk-Aktionsleiste.
5. Toolbar zeigt: Anzahl, Auswahl aufheben, erlaubte Aktionen.
6. Destruktive Aktionen: Danger-Stil + Bestätigungsdialog.
7. Nach Erfolg Auswahl bereinigen.
8. Fehler einzelner Datensätze klar melden.
9. Versteckte Auswahl darf nicht unbemerkt mitbearbeitet werden.

**„Alle auswählen"-Semantik:** Bei aktiven Filtern = alle passenden Ergebnisse;
ohne Filter = alle Einträge. Bei Pagination/Virtualisierung nie stillschweigend
nur die aktuelle Seite; falls doch, muss die UI das ausdrücklich so nennen.
Bevorzugt echte Auswahl aller gefilterten Datensätze.

**Backend-Regel:** Keine grosse Folge einzelner Socket-Aufrufe aus dem Browser.
Dediziertes Bulk-Event/Handler; serverseitige Autorisierung pro Datensatz;
Transaktion wo sinnvoll; strukturierte Antwort (erfolgreich / übersprungen /
fehlgeschlagen / Fehlergrund). Bei kleinen In-Memory-Datensätzen darf eine
ID-Liste übertragen werden; bei „alle gefilterten" alternativ validierter
Filter-Scope serverseitig.

## 3.3 Einzel- und Bulk-Aktionen

Identische fachliche Regeln: Wer einzeln nicht deaktiviert werden darf, darf es
auch über Bulk nicht. Eine Klasse mit Abhängigkeiten darf über Bulk nicht
unsicherer gelöscht werden als einzeln. Ein deaktivierter Schüler darf über
keinen Dialog einem aktiven Spiel beitreten.

---

# 4. Work Package A – Spielmodus strukturieren (`/manager/config/gamemode`)

## 4.1 Problem
Switches nicht sauber untereinander; Titel/Switch/Beschreibung mit
unterschiedlichen Startpositionen; lose Controls statt strukturierter Seite;
Endbildschirm-Optionen als Pills statt Schalter.

## 4.2 Zielstruktur (Abschnitte)
- **Spielablauf:** Team-Modus, Low-Latency-Modus, Lobby-Sperre, Antwortreihenfolge
- **Wertung:** Geschwindigkeit, Genauigkeit
- **Schule:** Klassen-Modus
- **Endbildschirm:** Vollständig, Top 3, Privat

Überschriften dürfen an bestehende Übersetzungen angepasst werden.

## 4.3 Setting-Zeilen
Titel links; optionale Badge „Neustart erforderlich" neben dem Titel;
Beschreibung darunter; Switch rechts in einheitlicher Spalte; Switches in
klarer vertikaler Linie.

## 4.4 Wertung
Exklusive Auswahl als semantische Radio-Gruppe (nicht zwei unabhängige
Switches); Titel+Hilfetext im Abschnitt; klarer Selected-State; vollständig
tastaturbedienbar.

## 4.5 Endbildschirm-Optionen als Schalter
`full`/`top3`/`private` als einzelne Switch-Zeilen. Aktiver Switch = Variante
steht beim Spielstart zur Auswahl. Interne Werte nicht umbenennen. Mindestens
eine Option aktiv; letzte aktive Option: Aktion blockieren + verständliche
Inline-Meldung. Deaktivierte Optionen fehlen im Spielstart-Dropdown. Wird die
gespeicherte Spielstart-Auswahl deaktiviert: auf erste erlaubte Option wechseln
+ sauber persistieren/normalisieren. Neustart-Badge nur wenn tatsächlich
Neustart nötig.

## 4.6 Akzeptanzkriterien
- [ ] Alle Switches vertikal ausgerichtet.
- [ ] Keine Beschreibung in losgelöster dritter Spalte.
- [ ] Wertung ist Radio-Gruppe.
- [ ] Endbildschirmvarianten sind Switches.
- [ ] Mindestens eine Endbildschirmvariante bleibt aktiv.
- [ ] Deaktivierte Endbildschirmvarianten fehlen im Spielstart.
- [ ] Mobile Darstellung stapelt sauber.
- [ ] Bestehende Speicherung funktioniert weiterhin.

---

# 5. Work Package B – Spielstart-Optionen konsolidieren (`/manager/config/play`)

## 5.1 Problem
Optionen unter der Quizliste lose angehängt; keine gemeinsame Struktur;
Endbildschirm-Dropdown fast volle Seitenbreite; nicht dieselbe
Komponentenfamilie wie `gamemode`.

## 5.2 Ziel
Abschnitt „Spieloptionen" unter der Quizliste mit derselben Settings-Zeile wie
`gamemode`: Geschwindigkeit berücksichtigen; Klassen-Modus/Klassen-Beitritte;
Endbildschirm.

## 5.3 Alignment
Beide Switches in derselben Control-Spalte; Titel+Beschreibung zusammen;
Controls nahe der Einstellung; klare visuelle Gruppierung ohne übergrosse Karte.

## 5.4 Endbildschirm-Select
Kein Full-Width-Control. Desktop ~`16–22rem` (z. B. `w-full sm:w-72` /
`w-full max-w-sm`); im Settings-Grid rechts ausrichten. Nur in `gamemode`
aktivierte Varianten anzeigen. Bei nur einer erlaubten Variante: Feld
deaktiviert oder statischer Wert. Keine internen Werte anzeigen; übersetzte
Labels. Tastatur + Screenreader erhalten.

## 5.5 Sticky Action Bar
„Spiel starten" Primary; „Solo-Link kopieren" Secondary. Leiste überdeckt den
letzten Optionsbereich nicht; genug Bottom-Padding; Auswahlzustand +
deaktivierte Primary-Aktion korrekt.

## 5.6 Akzeptanzkriterien
- [ ] Optionsbereich als eigener Abschnitt erkennbar.
- [ ] Switches sauber ausgerichtet.
- [ ] Beschreibungen bei ihren Titeln.
- [ ] Endbildschirm-Select mit begrenzter Breite.
- [ ] Nur erlaubte Endbildschirmvarianten erscheinen.
- [ ] Sticky Bar überdeckt keine Controls.

---

# 6. Work Package C – Nutzerverwaltung erweitern (`/manager/config/users`)

## 6.1 Wortlaut
Hauptbutton: „Neuen Benutzer anlegen" (nicht „Neue Lehrkraft anlegen"). Alle
sechs Locales. Seitenbeschreibung deckt Nutzer, Lehrkräfte, Administratoren ab.

## 6.2 Suche und Filter
Suche nach Benutzername; Rollenfilter (alle/Nutzer/Lehrkraft/Admin);
Statusfilter (alle/aktiv/deaktiviert). Vorhandene Filter-Pills und
Search-Komponenten wiederverwenden.

## 6.3 Mehrfachauswahl
Checkbox pro Benutzer + „Alle auswählen". Bulk: Aktivieren, Deaktivieren,
Löschen. Bulk-Dialog: Anzahl, bis zu einige Namen als Vorschau, „und N
weitere", übersprungene geschützte Konten.

## 6.4 Sicherheitsregeln (serverseitig UND Frontend)
- Kein Self-Deactivate, kein Self-Delete.
- Letzter aktiver Administrator: weder deaktivierbar noch löschbar.
- Berechtigung nie nur über ausgeblendete Buttons.
- Bulk umgeht Schutzregeln nicht.
- Geschützte Einträge: nicht auswählbar ODER überspringen + präzise melden.
  Bevorzugt: auswählbar für harmlose Aktionen, geschützte destruktive Aktion
  serverseitig zurückweisen.

## 6.5 Benutzer kopieren
Zeilen-Aktion „Benutzer kopieren" — kein blindes Duplizieren. Öffnet den
vorhandenen Erstellen-/Bearbeiten-Dialog im Kopiermodus. Übernehmen: Rolle,
nicht-sensitive Einstellungen, fachliche Berechtigungen (sofern Modell-konform).
NICHT übernehmen: ID, Benutzername unverändert, Passwort, Passwort-Hash,
PIN/Zugangsschlüssel, Sessions, Tokens, letzter Login, Audit-Metadaten.
Username-Vorschlag `name-kopie`, eindeutig validiert. Neue Zugangsdaten bewusst
gesetzt/generiert. Dialogtitel „Benutzer kopieren". Ergebnis = echter neuer
Benutzer. Falls Dialog nicht wiederverwendbar: Formzustand sauber extrahieren,
kein zweiter fast identischer Dialog.

## 6.6 Aktionsicons
Kopieren; Zugang zurücksetzen; Aktivieren/Deaktivieren; Löschen. Alle mit
`aria-label`, Tooltip/`title`, gleicher Icongrösse, konsistenter Reihenfolge,
Danger-Stil für Löschen.

## 6.7 Akzeptanzkriterien
- [ ] Button „Neuen Benutzer anlegen".
- [ ] Beschreibung deckt alle Rollen ab.
- [ ] Suche, Rollen- und Statusfilter funktionieren.
- [ ] Bulk aktivieren/deaktivieren/löschen.
- [ ] Selbstschutz + letzter-Admin-Schutz auch für Bulk.
- [ ] Benutzer sicher kopierbar.
- [ ] Keine Secrets/Zugangsdaten kopiert.

---

# 7. Work Package D – Ergebnisse mehrfach löschen (`/manager/config/results`)

## 7.1 Ziel
Checkbox pro Ergebnis; „Alle auswählen"; Bulk-Löschung; alle passenden
Ergebnisse auswähl- und löschbar; ohne Filter = alle Ergebnisse.

## 7.2 Filter-Scope sichtbar
Präzise Formulierungen („12 Ergebnisse ausgewählt" / „Alle 12 gefilterten
Ergebnisse ausgewählt" / „Alle 128 Ergebnisse ausgewählt"). Keine Mehrdeutigkeit
zwischen aktueller Seite, sichtbaren Zeilen, allen gefilterten, Gesamtbestand.

## 7.3 Löschablauf
Bestätigungsdialog: Anzahl, aktiver Filter, Nicht-rückgängig-Hinweis,
Danger-Button. Bei sehr grosser Komplettlöschung zusätzliche bewusste
Bestätigung (z. B. Eingabe „ALLE LÖSCHEN") zulässig — nicht für kleine
Auswahlen erzwingen.

## 7.4 Datenintegrität
Serverseitige Autorisierung; Ergebnisse + abhängige Detaildaten konsistent
entfernen; keine verwaisten Detailzeilen/Share-Tokens; Transaktion bei mehreren
Tabellen; Teilen bleibt Einzelaktion; nach Erfolg Liste aktualisieren + Auswahl
löschen; bei Teilfehler strukturierte Rückmeldung.

## 7.5 Akzeptanzkriterien
- [ ] Mehrere Resultate auswählbar.
- [ ] Alle gefilterten bzw. alle Resultate auswählbar.
- [ ] Bulk-Löschen über sicheren Backend-Handler.
- [ ] Scope in Toolbar und Dialog eindeutig.
- [ ] Einzel-Löschen konsistent.
- [ ] Auswahl nach Erfolg zurückgesetzt.

---

# 8. Work Package E – Klassen mehrfach verwalten (`/manager/config/classes`)

## 8.1 Statusmodell
Klassen aktiv/deaktiviert. Falls nicht vorhanden: persistentes Feld
(vorzugsweise `active`), Default aktiv, DB-Migration, Rust-Modelle/Queries/
Events/gemeinsame Types aktualisieren.

## 8.2 Bedeutung „deaktiviert"
Bleibt bestehen; behält Schüler- und Fachzuordnungen; löscht keine Resultate;
erscheint nicht standardmässig in aktiven Spiel-/Zuweisungsflows; über
Statusfilter anzeigbar; reaktivierbar. Serverseitig durchsetzen.

## 8.3 Mehrfachauswahl
Checkbox pro Klasse + „Alle auswählen". Bulk: Aktivieren, Deaktivieren,
Löschen. Statusfilter: Alle/Aktiv/Deaktiviert.

## 8.4 Löschen einer Klasse
Darf Schüler nicht löschen: Klasse entfernen; Schüler-Klassen-Zuordnungen
entfernen; Schüler behalten; Resultate behalten; historische Anzeigen dürfen
nicht abstürzen; Fachzuordnungen entfernen. Vor Implementierung Schema prüfen.
Bestätigungsdialog: Anzahl+Namen, betroffene Schülerzuordnungen,
Fachzuordnungen, Auswirkungen auf Klassenzuweisungen, Hinweis dass
Schülerkonten+Resultate bleiben. Falls Schema unsichere Löschung: referenzielle
Integrität zuerst korrekt lösen; keine unkontrollierte Cascade; ggf. SET NULL,
Snapshot-Daten oder explizite Join-Tabellen-Bereinigung.

## 8.5 Akzeptanzkriterien
- [ ] Persistenter Aktivstatus.
- [ ] Bulk aktivieren/deaktivieren/löschen.
- [ ] Schüler + Resultate bleiben bei Klassenlöschung.
- [ ] Deaktivierte Klassen fehlen in aktiven Auswahlflows.
- [ ] Statusfilter funktioniert.
- [ ] Einzel- und Bulk-Regeln identisch.

---

# 9. Work Package F – Schülerverwaltung erweitern (`/manager/config/students`)

## 9.1 Klassen-Chips
Höhe ~28–32 px; kleinere Innenabstände; kleinere lesbare Schrift; platzsparend;
Wrap bei Platzmangel; Entfernen-Control ≥ WCAG Target Size Minimum; sichtbarer
Fokus; kein 44-px-Pill pro Zuordnung. Trigger heisst „Klasse hinzufügen"
(nicht „+ + Klasse"), Plus-Icon höchstens einmal.

## 9.2 Statusmodell
Schüler aktiv/deaktiviert; falls fehlend: persistentes Feld, Default aktiv,
Migration + Backendmodell. Deaktiviert: kein Login/Beitritt (serverseitig
abgelehnt, auch bei manipuliertem Client); bleibt in Klassen; behält
Ergebnisse; reaktivierbar; klar markiert; aus aktiven
Beitritts-/Zuweisungsdialogen ausgeschlossen.

## 9.3 Mehrfachbearbeitung
Checkbox + „Alle auswählen". Bulk: Aktivieren, Deaktivieren, Löschen, Klasse
hinzufügen, Aus Klasse entfernen. Optional (nur wenn modellkonform):
Zugangsdaten neu erzeugen.

**Klassenzuordnung:** Bulk-Dialog zeigt standardmässig nur aktive Klassen;
allen zugeordnete Klasse markiert; teilweise zugeordnete als gemischter
Zustand; „Hinzufügen" ohne Duplikate; „Entfernen" nur gewählte Klasse;
deaktivierte Schüler dürfen administrativ zugeordnet werden falls fachlich
sinnvoll (bewusst entscheiden + dokumentieren).

## 9.4 Schüler löschen
Dialog: Anzahl, Namen/Vorschau, Klassen, Auswirkungen auf historische
Resultate. Historische Resultate verschwinden nicht kommentarlos.
Datenschutz-/Pseudonymisierungsmodell prüfen; Referenzen sicher lösen; keine
unkontrollierte Cascade; Einzel- und Bulk identisch.

## 9.5 Druckbare Zugangsdaten pro Klasse
**Einstieg:** Toolbar-Aktion „Zugangsdaten drucken" → Klasse wählen; oder
Aktion direkt bei einer Klasse. Kein unbeschrifteter Druck-Icon.

**Druckdialog:** Klasse; nur aktive / aktive+deaktivierte / aktuell ausgewählte
Schüler; Format: Einzelblätter für Schüler ODER Gesamtblatt für Lehrperson.

**Einzelblatt (A4/Schüler):** reduziertes Razzoozle-Branding; Schülername;
Klassenname; Benutzername/Kennung; PIN bzw. reales Zugangsmittel; Login-URL;
optional QR-Code; kurze Anleitung; Vertraulichkeitshinweis.
`@media print`: App-Shell/Nav/Buttons ausblenden; A4-optimiert;
`break-after: page` pro Schüler; kein abgeschnittener QR-Code; keine leere
Zusatzseite.

**Gesamtblatt:** Kopf (Klassenname, Druckdatum, Anzahl, Status-Scope) +
Tabelle (Schülername, Kennung, PIN/temp. Passwort, Status). A4 Hoch/Quer nach
Lesbarkeit.

**Sicherheitsmodell:** Kein Hash-Rückrechnen; keine neue dauerhafte
Klartext-Speicherung; keine Zugangsdaten in Logs/Telemetrie/Konsole; nicht
dauerhaft in Local Storage/Zustandspersistenz/URL. Falls PINs sicher abrufbar:
bestehendes Modell verwenden. Falls nicht mehr verfügbar: bewusste Aktion
„Neue Zugangsdaten erzeugen" → serverseitig erzeugen → Hash/sichere
Repräsentation speichern → Klartext genau einmal an autorisierten Admin →
nur flüchtiger Dialog-/Print-State → nach Schliessen entfernen. QR-Code ohne
Geheimnis (bevorzugt Login-URL + Kennung; Geheimnis separat). Zugriff nur für
berechtigte Rollen.

**Terminologie:** reales Zugangsmodell benennen (`PIN`/`Passwort`/
`Zugangscode`) — nicht pauschal „Passwort" wenn technisch PIN.

## 9.6 Akzeptanzkriterien
- [ ] Klassen-Chips deutlich kompakter.
- [ ] „Klasse hinzufügen" korrekt beschriftet.
- [ ] Persistenter Aktivstatus.
- [ ] Deaktivierte Schüler können nicht beitreten.
- [ ] Bulk aktivieren/deaktivieren/löschen/Klassen zuordnen.
- [ ] Gruppenzuordnung ohne Duplikate.
- [ ] Zugangsdaten pro Klasse druckbar.
- [ ] Einzelblatt = genau eine Seite pro Schüler.
- [ ] Gesamtblatt als Lehrpersonenübersicht.
- [ ] Keine unsichere Klartext-Speicherung/Logging.

---

# 10. Gemeinsame Backend- und Datenbankanforderungen

Keine reine Frontend-Simulation.

## 10.1 Vorhandene Contracts zuerst
Pro Entität: TS-Type; Socket-Event/API-Route; Rust-Request/Response-Type;
Autorisierungsprüfung; DB-Query; Migration; Frontend-Store/Context; Tests.

## 10.2 Statusfelder
Nur ergänzen wenn fehlend: `classes.active`, `students.active`. Namensgebung
an Schema anpassen. Migration: nicht nullable; bestehende Zeilen aktiv;
geeigneter Index falls häufig gefiltert.

## 10.3 Bulk-Events
Benennung an bestehende Konventionen anpassen (sinngemäss USER.BULK_UPDATE,
USER.BULK_DELETE, RESULT.BULK_DELETE, CLASS.BULK_UPDATE, CLASS.BULK_DELETE,
STUDENT.BULK_UPDATE, STUDENT.BULK_DELETE, STUDENT.BULK_ASSIGN_CLASS,
STUDENT.BULK_REMOVE_CLASS — keine vorgeschriebenen exakten Namen). Payloads:
Zod/shared types falls üblich; maximale ID-Anzahl validieren; leere Listen
ablehnen; Duplikate normalisieren; Berechtigung serverseitig; strukturierte
Resultate.

## 10.4 Concurrency und Wiederholung
Bulk idempotent; doppelte (De-)Aktivierung fehlerfrei; mehrfaches Zuweisen ohne
doppelte Join-Zeilen; UI gegen Doppel-Submit sperren; nach Serverantwort neu
laden oder optimistisch nur mit sauberem Rollback.

---

# 11. Accessibility

## 11.1 Auswahl
Checkboxen mit eindeutigen Labels; Header-Checkbox verständlich benannt;
Tri-State über `indeterminate`; Bulk-Toolbar `role="toolbar"` + zugängliche
Bezeichnung; Auswahländerungen über Live-Region (sofern System vorhanden).

## 11.2 Switches
Semantisches Switch-Control; Label klickbar; Beschreibung via
`aria-describedby`; Badge nicht Teil des Namens aber zugänglich; Fokus
sichtbar; Status nicht nur über Violett/Grau.

## 11.3 Dialoge
Titel + Beschreibung; Fokus beim Öffnen sinnvoll; Fokus zurück zum Trigger;
Escape schliesst nicht während irreversibler Serveraktion; kein
Portal-Bubbling in darunterliegende Zeilen; keine verschachtelten
interaktiven Elemente.

## 11.4 Drucken
Sinnvolle Dokumentüberschrift; QR-Code mit Textalternative; Informationen
nicht ausschliesslich im QR-Code; Bildschirmdialog tastaturbedienbar.

---

# 12. i18n

Alle neuen/geänderten Texte in allen Locales. Mindestens: Neuen Benutzer
anlegen; Benutzer kopieren; Ausgewählt; Alle auswählen; Alle gefilterten
auswählen; Auswahl aufheben; Aktivieren; Deaktivieren; Ausgewählte löschen;
Klasse hinzufügen; Aus Klasse entfernen; Zugangsdaten drucken; Einzelblätter;
Gesamtblatt für Lehrperson; Nur aktive Schüler; Neue Zugangsdaten erzeugen;
Neustart erforderlich; Mindestens eine Endbildschirm-Option muss aktiv bleiben.

Keine neuen dauerhaften `defaultValue`-Fallbacks. Ausführen:
`pnpm i18n:check`, `pnpm i18n:report`.

---

# 13. Testplan

## 13.1 Statische Gates
`pnpm -r run types` · `bash scripts/check-manager-tokens.sh` · `pnpm lint` ·
`pnpm test` · `pnpm i18n:check` · bei Rust/DB/Events: `bash rust/gate.sh`.

## 13.2 Unit-/Integrationstests (mindestens)
**Auswahl:** einzelne Checkbox; alle auswählen; indeterminate; Auswahl nach
Filterwechsel; nach Löschung; geschützte Einträge; Teilfehler.
**Gamemode:** Switches persistieren; letzte Endbildschirmoption nicht
deaktivierbar; deaktivierte Optionen fehlen im Play-Select; Fallback bei
ungültiger gespeicherter Auswahl.
**Nutzer:** Kopieren ohne Secrets; Username eindeutig; Self-Delete/Disable
blockiert; letzter aktiver Admin geschützt; Bulk-Regeln identisch.
**Ergebnisse:** mehrere IDs; alle gefilterten; abhängige Datensätze; leere
Auswahl abgelehnt.
**Klassen:** Deaktivieren erhält Mitgliedschaften+Resultate; Löschen entfernt
Mitgliedschaften aber keine Schüler; deaktivierte fehlen in aktiven Flows.
**Schüler:** deaktiviert = kein Beitritt; Resultate bleiben;
Bulk-Klassenzuordnung ohne Duplikate; sichere Löschung/Pseudonymisierung;
Zugangsdaten-Klartext nur im einmaligen Response.

## 13.3 E2E/Browser (bestehendes Playwright-/Stagehand-System)
1. gamemode: Switch-Ausrichtung. 2. Endscreen-Option deaktivieren → play-Dropdown.
3. Letzte Endscreen-Option. 4. Play-Optionsbereich Desktop+Mobile. 5. Bulk-User-
Deactivate. 6. Geschütztes eigenes Admin-Konto in Bulk. 7. User kopieren.
8. Mehrere Ergebnisse löschen. 9. Alle gefilterten Ergebnisse. 10. Klassen
deaktivieren+filtern. 11. Klassen löschen ohne Schülerverlust. 12. Schüler
deaktivieren → Beitritt abgelehnt. 13. Bulk-Klassenzuordnung. 14. Kompakte
Chips. 15. Einzelblätter-Druckvorschau. 16. Gesamtblatt. 17. Dialoge
öffnen/abbrechen ohne Stacking/Row-Click.
Keine destruktiven E2E gegen Prod-Echtdaten; lokale/Test-Fixtures.

## 13.4 Visual Regression
Viewports: 1920×1080, 1440×900, 1280×800, 1024×768, 390×844.
Prüfen: Switch-Linie; Beschreibungen beim Titel; kompaktes Play-Dropdown;
Bulk-Toolbar-Umbruch; Checkbox-Layout-Stabilität; kompakte Chips; Sticky Bar;
Print Preview ohne Manager-Navigation.

---

# 14. Empfohlene Commit-Reihenfolge

```text
docs(manager): map follow-up implementation scope
refactor(manager-settings): align gamemode and play option rows
feat(manager-users): add filters bulk actions and safe copy flow
feat(manager-results): add select-all and bulk deletion
feat(manager-classes): add active status and bulk management
feat(manager-students): add active status and bulk editing
feat(manager-students): add secure class credential print views
test(manager): cover follow-up settings and bulk workflows
chore(manager): remove obsolete local variants and locale fallbacks
```

Backend+Frontend eines Features dürfen in einem Commit liegen, wenn er
lauffähig bleibt.

---

# 15. Nicht-Ziele

Sidebar-Überarbeitung; Rebranding; neues UI-Framework; Umgestaltung von
Medien/Katalog/Vorschlägen/Design/KI/Achievements; neue Rollenarchitektur;
Export personenbezogener Daten ausserhalb der Druckfunktion; Speicherung
druckbarer Klartext-Passwörter; Scoring-Modell; bestehende
Endbildschirm-Inhalte; erneute SDD-/Design-Audit-Runde. Nur mitändern, wenn
eine gemeinsame Komponente angepasst werden muss und bestehende Ansichten
nachweislich nicht regressieren.

---

# 16. Definition of Done

- [ ] `gamemode` klar strukturiert; Switches in einheitlicher Control-Spalte.
- [ ] Endbildschirmoptionen als Switches.
- [ ] `play` nutzt dieselbe Settings-Struktur; Dropdown kompakt.
- [ ] Nutzer-Button korrekt benannt; Benutzer kopierbar ohne Secrets.
- [ ] Nutzer/Ergebnisse/Klassen/Schüler mehrfach bearbeitbar wie spezifiziert.
- [ ] Klassenlöschung löscht keine Schüler/Resultate.
- [ ] Deaktivierte Schüler können nicht beitreten.
- [ ] Klassen-Chips kompakt; Zugangsdaten druckbar (Einzel + Gesamt).
- [ ] Keine unsichere Klartext-Passwortspeicherung.
- [ ] Übersetzungen vollständig; alle Gates grün (inkl. rust/gate.sh bei
      Backend-Änderungen).
- [ ] Unabhängiger Review-Agent hat den tatsächlichen Diff geprüft.

---

# 17. Abschlussbericht-Format

Umgesetzte Work Packages · Geänderte Datenmodelle und Events (Tabelle) ·
Wiederverwendete Shared Components · Neue Shared Components (mit Begründung
oder „Keine") · Bulk-Aktionen (Tabelle: Entität/Aktionen/Select-all-Scope/
Schutzregeln) · Sicherheitsentscheidungen bei Zugangsdaten · Tests (Tabelle
Befehl/Ergebnis) · Browser-QA (Tabelle URL/Viewports/Ergebnis) · Bekannte
Restpunkte · Abweichungen von dieser SDD.

Keine Fertigmeldung ohne tatsächliche Testausgaben und unabhängigen
Diff-Review.
