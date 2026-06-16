# Epic: Rahoot Manager — UX/UI-Audit-Nachzug (Restlücken nach V2)

## Goal / context

Triage + Backlog aus der externen UX/UI-Analyse "Rahoot Manager – UX/UI-Analyse und Empfehlungen" (ChatGPT-Audit, explorative Nutzung am 15. Juni 2026, Ziel-URL https://rahoot.joelduss.xyz/manager/config). Jede PDF-Empfehlung wurde gegen den **aktuellen Code** (post-V2, post-Issue-#10) geprüft — nicht gegen die Annahmen des Audits. Ergebnis: Der Großteil der Empfehlungen ist bereits umgesetzt (siehe "Already shipped"). Dieses Epic listet ausschließlich die **echten Restlücken**, agent-ready zerlegt mit Dateipfaden, Akzeptanzkriterien, Priorität und Backend-Flag.

Stack-Erinnerung: React + Vite + Tailwind v4 + motion (web), Socket-Backend (`packages/socket`), geteilte Typen + zod-Validatoren (`packages/common`). i18n: 5 Locales (`de/en/es/fr/it`) — jeder neue String braucht Keys in allen 5. WebP-only bleibt Constraint. Auth ist heute ein **einzelnes Manager-Passwort** (`manager.withAuth` + `loggedClients: Set`), kein Rollensystem.

---

## Already shipped (NICHT neu bauen)

Vom Audit empfohlen, im Code bereits vorhanden — verifiziert:

- **Icon-Actions mit Tooltip (`title`) + `aria-label`, 44px Touch-Target, roter Destructive-Hover** → `packages/web/src/features/manager/components/console/ListRow.tsx` (`ListRowAction.label` ist Pflicht). Genutzt in ConfigManageQuizz/ConfigCatalog/ConfigResults.
- **EmptyStates überall** (Headline + Hint + Action-Button) → `console/EmptyState.tsx` (Quizz, Katalog, Media, Ergebnisse, Submissions, AI, Theme-Templates).
- **Single-Scroll-Owner + Sticky Save/Reset-Bar** → `console/ConsoleShell.tsx` + `console/StickyActions.tsx` (ConfigTheme nutzt StickyActions).
- **Asset-Previews + per-Slot Aspect + Scrim-Overlay** → `console/AssetPreview.tsx`, `console/AssetPreviewCard.tsx` (Logo + 3 BG-Slots in ConfigTheme).
- **WCAG-Kontrast-Badge MIT Warnung (amber "Kontrast schwach" + `!`) + Answer-Mini-Preview** → `console/ColorSwatchField.tsx` + `console/contrast.ts`. Audit-Punkt "Kontrastwarnungen" = DONE (UI-Farben + Antwort-Farben).
- **Design = Theme-COCKPIT** (Settings links / sticky Live-Preview rechts mit Join/Frage/Rangliste aus dem Draft) + Templates als Preset-Cards (Apply/Delete + Farb-Streifen) → `configurations/ConfigTheme.tsx`, `configurations/theme-preview/ThemePreviewPanel.tsx`. Theme-Reset-Button vorhanden.
- **Theme-Template-System** (speichern/laden/löschen, Apply zum Vorschauen) → ConfigTheme + `THEME_TEMPLATE.*`-Events.
- **Play: Fragenanzahl-Meta pro Quiz + Start enabled/disabled + Tooltip "Bitte ein Quiz auswählen" auf disabled** → `configurations/ConfigSelectQuizz.tsx` (`SelectableRow` meta, `title` auf disabled Button). Radiogroup-Semantik.
- **AI-Provider Tri-State-Status-Badge (Aus/Bereit/Fehler) + Inline Test/Save/Generate `aria-live` Notices** → `configurations/ConfigAI.tsx`. Quiz-Generierung mit Count-Eingabe (geclampt min/max).
- **Katalog (Fragenbank) + "Aus Katalog einfügen" / "In Katalog speichern" + Approve-Submission-to-Catalog + Tags + Suche + Frage-Editor wiederverwendet** → `configurations/ConfigCatalog.tsx` (Tags als Komma-Liste, Type+Source-Badges, Datum), Editor-Sidebar, ConfigSubmissions.
- **Editor AI-Assist (Frage-aus-Thema + Distraktoren)** → `features/quizz/components/QuestionEditorAIAssist.tsx`.
- **Submissions-Moderation-Tab** (Titel/Autor/Datum, ausklappbare Frage-Preview mit Lösung, Approve→Quiz/Katalog, Inline-Edit, Reject mit Confirm) + Nav-Badge-Count → `configurations/ConfigSubmissions.tsx`, `configurations/index.tsx` (`pendingCount`).
- **Medien-Bibliothek** (Previews, Quelle-Filter-Chips, Suche, Größe + Datum + Kategorie + Quelle Meta, lazy-load, Delete-Confirm) → `configurations/ConfigMedia.tsx`.
- **i18n: LanguageSwitcher + persistierte Sprache, 5 Locales** → `components/LanguageSwitcher.tsx`, `locales/{de,en,es,fr,it}/`.
- **Full-Viewport Console-Frame (kein Tab-Jump, einheitliche Margin)** → `pages/manager/config.tsx` + ConsoleShell.
- **Editor: Multi-Select (Ctrl/Shift-Klick) + Bulk-Delete (Confirm) + Bulk-to-Katalog + Drag-Reorder mit Keyboard-Sensor + prominente "Frage hinzufügen" / "Aus Katalog"-Buttons** → `features/quizz/components/QuizzEditorSidebar.tsx`. (Audit-Punkte "Massenaktionen", "FAB-prominente Buttons", "auto-scroll bei Hinzufügen via addQuestion→setCurrentIndex" weitgehend abgedeckt.)
- **Fragetyp-Auswahl als Icon+Text-Karten** (Radiogroup, Pfeil-Navigation, Beschreibungen) + **Bonusfrage/Übungsfrage als Toggles, gegenseitig ausschließend** → `features/quizz/components/QuestionEditor/QuestionEditorType.tsx` (`toggleBonus` setzt `practice:false` und umgekehrt). Audit-Punkte "Icon+Text Fragetyp" + "Bonus/Übung mutual-exclusion" = DONE.
- **Antwort: richtige Antwort visuell markiert** (Checkmark-Kreis, weißer Hintergrund, `aria-pressed`) → `QuestionEditor/QuestionEditorAnswers.tsx`.
- **Ergebnis-Detail-Modal mit Statistik** (Richtig-% Donut + Beantwortet-Count + per-Frage Antwort-Breakdown + Tabelle) → `manager/components/ResultModal/` (ResultModalStats/Answers/Table). Ergebnis-Liste mit Datum + Spielerzahl + Share-Link → `ConfigResults.tsx`.
- **Quizz: Delete-Confirm-Dialog + Archiv-Sektion + JSON-Import** → `ConfigManageQuizz.tsx` (AlertDialog).
- **Satellit: nummerierter Stepper (3 Schritte mit Icons) + Hinweis-Box** → `ConfigDisplay.tsx`.

---

## Prioritized backlog (echte Lücken)

Priorität: **P1** = Quick-Win, hoher Nutzen / geringer Aufwand · **P2** = mittel · **P3** = größer / Schema-Arbeit. `[CLIENT]` = nur Web, `[BACKEND]` = braucht `packages/common`- und/oder `packages/socket`-Änderung.

### A — Quiz-Editor: Datenverlust-Schutz

**WP-1 · Editor Unsaved-Indicator + Confirm-on-Leave + Strg+S** · **P1** · `[CLIENT]`
- Scope: Dirty-Tracking im Editor. Roter Punkt / "Ungespeichert"-Marker am Save-Button; Abfrage beim Verlassen ("Beenden", Router-Navigation, `beforeunload`); `Ctrl/Cmd+S` löst Save aus.
- Dateien: `features/quizz/contexts/quizz-editor-context.tsx` (Dirty-Flag: Snapshot `initialData` vs. aktueller `{subject, themeId, questions}` — oder `isDirty`-State der bei jedem Setter true wird, bei Save-Success false), `features/quizz/components/QuizzEditorHeader.tsx` (Punkt am Save-Button, Confirm-AlertDialog vor `navigate({to:"/manager"})` im Exit-Handler, Strg+S-Listener), evtl. `pages/manager/quizz.*` für Router-`beforeLeave`/blocker. Wiederverwenden: `components/AlertDialog`.
- Akzeptanz: (1) Nach einer Änderung zeigt der Save-Button einen sichtbaren Unsaved-Marker. (2) "Beenden" oder Navigieren mit ungespeicherten Änderungen öffnet einen Bestätigungsdialog ("Möchten Sie speichern?" / Verwerfen / Abbrechen). (3) `Ctrl+S` und `Cmd+S` speichern (preventDefault des Browser-Save). (4) Nach erfolgreichem Save ist der Editor wieder "clean". (5) `useReducedMotion` respektiert; alle 5 Locales.

### B — Quizverwaltung-Tab

**WP-2 · Quiz-Liste: Suche + Sortierung + Duplizieren-Confirm** · **P1** · `[CLIENT]`
- Scope: Über der Quiz-Liste eine Suchleiste (nach Subject) + Sortier-Auswahl (Name A–Z / Fragenanzahl / — Erstellungsdatum nur wenn `QuizzMeta` ein Datum trägt, sonst weglassen). "Duplizieren" öffnet vor dem Emit einen kleinen Dialog (Titel anpassen optional + bestätigen) statt direkt zu duplizieren.
- Dateien: `configurations/ConfigManageQuizz.tsx` (lokaler `search`/`sort`-State, `useMemo`-Filter wie in ConfigCatalog/ConfigMedia; Duplicate-Confirm via vorhandenem `AlertDialog` oder Mini-Modal). Muster aus `ConfigCatalog.tsx` (Suche) übernehmen. `ManagerConfig.quizz` liefert die volle Liste bereits client-seitig.
- Akzeptanz: (1) Suchfeld filtert die aktive + archivierte Liste live. (2) Sortier-Auswahl ändert die Reihenfolge der aktiven Liste. (3) "Duplizieren" zeigt einen Bestätigungsschritt (mind. Confirm; ideal Titel-Edit) vor dem `QUIZZ.DUPLICATE`-Emit. (4) Leerer Suchtreffer zeigt einen `EmptyState` (Muster: ConfigCatalog `SearchX`). (5) Alle 5 Locales.

**WP-3 · Quiz-Liste: Bulk-Select (Mehrfach-Löschen)** · **P2** · `[CLIENT]`
- Scope: Checkbox-Mehrfachauswahl pro Zeile + Bulk-Toolbar ("N ausgewählt" → Löschen mit Confirm). Export-Bundle ist NICHT Teil (siehe Non-Goals).
- Dateien: `configurations/ConfigManageQuizz.tsx`. Pattern existiert bereits 1:1 in `features/quizz/components/QuizzEditorSidebar.tsx` (Selection-Set + Toolbar + Bulk-AlertDialog) — als Vorlage adaptieren. Bulk-Delete = Schleife über vorhandenes `QUIZZ.DELETE`.
- Akzeptanz: (1) Zeilen sind per Checkbox mehrfach selektierbar. (2) Eine Toolbar erscheint bei Auswahl mit Count + "Löschen". (3) Bulk-Delete bestätigt via Dialog, emittet pro Quiz ein `QUIZZ.DELETE`. (4) Selektion wird nach Aktion/Tabwechsel zurückgesetzt. (5) Touch-Target ≥ 44px; alle 5 Locales.

### C — Medien-Bibliothek

**WP-4 · Editor: "Aus Bibliothek wählen" für Frage-Medien** · **P1** · `[CLIENT]`
- Scope: Im Frage-Editor-Medien-Block ein dritter Weg neben URL-Paste und KI-Generierung: ein Picker-Modal, das `MEDIA.LIST`/`MEDIA.DATA` (existiert, manager-auth) lädt und das gewählte Bild als `question.media.url` setzt. Behebt den Audit-Punkt "derzeit muss man über Medien navigieren und zurück".
- Dateien: neues `features/quizz/components/MediaPickerModal.tsx` (Grid + Suche, analog `CatalogPickerModal.tsx` als Struktur-Vorlage), eingebunden in `features/quizz/components/QuestionEditor/QuestionEditorMedia.tsx` (Button "Aus Bibliothek"). Reuse `MEDIA.LIST` Event.
- Akzeptanz: (1) Editor-Medien-Karte hat einen "Aus Bibliothek"-Button. (2) Picker zeigt die Bild-Medien (Filter/Suche optional), Klick setzt `media={type:"image", url}`. (3) Kein neuer Socket-Event. (4) Modal ist a11y-konform (role=dialog, Escape schließt, Fokus). (5) Alle 5 Locales.

**WP-5 · Media: Drag-&-Drop-Upload + Bulk-Select-Delete** · **P2** · `[CLIENT]`
- Scope: Drag-&-Drop-Zone (Dateien auf den Bereich ziehen → Upload pro Datei via vorhandenem `MEDIA.UPLOAD`). Mehrfachauswahl der Karten + Bulk-Delete (Confirm) via Schleife über `MEDIA.DELETE`.
- Dateien: `configurations/ConfigMedia.tsx` (Drop-Handler auf den Grid-Container, Selection-Set + Bulk-Toolbar — Pattern aus QuizzEditorSidebar). Größencheck `MAX_UPLOAD_BYTES` + WebP-Constraint pro Datei beibehalten.
- Akzeptanz: (1) Dateien per Drag-&-Drop hochladbar; jede Datei nutzt `MEDIA.UPLOAD`. (2) Karten mehrfach selektierbar, Bulk-Delete mit Confirm. (3) Bestehende Größen-/Typprüfung bleibt aktiv. (4) Alle 5 Locales.

**WP-6 · Media: Datei-Dimensionen (Breite×Höhe)** · **P3** · `[BACKEND]`
- Scope: `width`/`height` zu `MediaMeta` ergänzen und beim Upload berechnen, in der Karte zusätzlich zu Größe/Datum anzeigen.
- Dateien: `packages/common/src/types/media.ts` (Felder `width?/height?`), `packages/socket/src/services/config.ts` (`saveMediaFile` ~Z.1132 — Dimensionen aus dem bereits dekodierten Bild ziehen; `webp.ts`/`toWebp` dekodiert ohnehin, dort günstig extrahierbar), Manifest-Backfill (vorhandene Einträge ohne Dimensionen tolerieren → optionale Felder), `configurations/ConfigMedia.tsx` (Anzeige). Nur Bild-Typ; Audio bleibt ohne.
- Akzeptanz: (1) Neue Uploads speichern `width`/`height`. (2) Karte zeigt `B×H` zusätzlich. (3) Alt-Einträge ohne Dimensionen crashen nicht (optional rendern). (4) WebP-Pipeline unverändert. (5) Validator (`media`-Validator falls vorhanden) akzeptiert die neuen optionalen Felder.

### D — Ergebnis-Management

**WP-7 · Ergebnisse: Suche/Datumsfilter + Anonymisieren-Toggle** · **P1** · `[CLIENT]`
- Scope: Suchfeld (Subject) + optional Datumsbereich über der Ergebnis-Liste. Toggle "Namen anzeigen" (default: anonymisiert) im Ergebnis-Detail-Modal — Spielernamen werden zu "Spieler 1…N" maskiert. Daten liegen client-seitig vollständig vor (`GameResult.players[].username`, `questions[].playerAnswers[].playerName`).
- Dateien: `configurations/ConfigResults.tsx` (Filter-State + `useMemo`), `manager/components/ResultModal/index.tsx` + `manager/contexts/result-modal-context` (Anonymize-State, an Table/Answers durchreichen), `ResultModal/ResultModalTable.tsx` / `ResultModalAnswers.tsx` (Namen über eine `displayName(idx)`-Helper rendern).
- Akzeptanz: (1) Ergebnis-Liste live durchsuchbar (+ optional Datumsfilter). (2) Detail-Modal hat einen "Namen anzeigen"-Toggle, default AUS → maskierte Namen. (3) Maskierung konsistent über Tabelle + Antwort-Breakdown. (4) Kein Socket-Change. (5) Alle 5 Locales.

**WP-8 · Ergebnisse: CSV-Export** · **P2** · `[CLIENT]`
- Scope: "Als CSV exportieren" im Ergebnis-Detail (oder pro Listeneintrag): erzeugt client-seitig aus dem vollständigen `GameResult` eine CSV (Spieler, Punkte, Rang; optional pro-Frage-Korrektheit) und triggert Download. Respektiert den Anonymisieren-Toggle aus WP-7.
- Dateien: neue Helper `features/manager/utils/resultExport.ts` (CSV-Builder + `Blob`-Download), Button in `ResultModal/ResultModalHeader.tsx`. Kein Backend (Audit "PDF" optional → siehe Non-Goals; PDF kann via Browser-Print/`window.print()` einer Print-CSS-Ansicht nachgereicht werden, nicht server-seitig).
- Akzeptanz: (1) Export-Button lädt eine wohlgeformte CSV des aktuellen Ergebnisses herunter. (2) Anonymisieren-Zustand wird respektiert. (3) Kein neuer Socket-Event. (4) Encoding UTF-8 mit BOM (Excel-Umlaute). (5) Label in allen 5 Locales.

> Hinweis Audit "Visualisierung/Balkendiagramm": Richtig-%-Donut + Beantwortet-Count existieren bereits (`ResultModalStats.tsx`). Ein zusätzliches Punkte-Balkendiagramm pro Spieler wäre **P3 [CLIENT]** (Daten vorhanden) — separat ziehen wenn gewünscht, sonst als "nice-to-have" deferren.

### E — KI-Einstellungen

**WP-9 · AI: Datenschutz-Hinweise + Test-Feedback-Text + Count-Slider** · **P2** · `[CLIENT]`
- Scope: (1) Kurze Datenschutz-/Erläuterungstexte pro Provider (welcher externe Dienst wird angesprochen, Link zu Datenschutz) als statische Copy/Hilfetexte. (2) Test-Ergebnis bereits `{ok,message}` — Message prominenter/erläuternder rendern. (3) Quiz-Generierung: Count als Slider statt Number-Input (Validator `aiGenerateQuizValidator.count` 1–15 existiert bereits → nur UI). Distraktoren-Count analog (`aiGenerateDistractorsValidator.count` 1–3).
- Dateien: `configurations/ConfigAI.tsx` (Hilfetexte/`SubGroup`, Slider statt `Input type=number`), Locale-Files (Privacy-Copy). Kein Backend für diese drei Punkte.
- Akzeptanz: (1) Jeder aktive Provider zeigt einen kurzen Datenschutz-Hinweis. (2) Test-Resultat zeigt eine verständliche Erfolgs-/Fehlermeldung. (3) Count via Slider, geclampt an die existierenden Validator-Grenzen. (4) Alle 5 Locales.

**WP-10 · AI: Granulare Generierungs-Parameter (Temperatur, Bild-Auflösung)** · **P3** · `[BACKEND]`
- Scope: Temperatur-Slider (Text-Gen) und Bild-Auflösungs-Auswahl (Bild-Gen) durchreichen. Heute fehlen beide in `AISettings` und in den Generate-Validatoren.
- Dateien: `packages/common/src/types/ai.ts` + `packages/common/src/validators/ai.ts` (Felder `temperature?` an Generate-Payloads; `resolution?`/`size?` an `GENERATE_IMAGE`), `packages/socket/src/services/ai-provider.ts` (Temperatur an die Completion durchreichen), `packages/socket/src/services/comfyui.ts` (Auflösung an die Bild-Pipeline; WebP-Output unverändert), `configurations/ConfigAI.tsx` + `QuestionEditor/QuestionEditorMedia.tsx` (Slider/Select). Defaults serverseitig setzen, damit Alt-Clients funktionieren.
- Akzeptanz: (1) Temperatur beeinflusst Text-Generierung (an Provider durchgereicht). (2) Bild-Auflösung wählbar, an ComfyUI durchgereicht, Output bleibt WebP. (3) Validatoren akzeptieren die neuen optionalen Felder mit serverseitigen Defaults. (4) Alle 5 Locales.

### F — Frage-Editor (Detail)

**WP-11 · AI-Assist: Ergebnis vor Einfügen prüfen** · **P2** · `[CLIENT]`
- Scope: Generierte Frage/Distraktoren NICHT direkt anwenden, sondern in einer kleinen Preview/Bestätigung zeigen ("Übernehmen" / "Verwerfen"). Backend liefert die Payload bereits ohne zu persistieren (`AI.QUESTION_GENERATED {question}`, `AI.DISTRACTORS_GENERATED {distractors}`).
- Dateien: `features/quizz/components/QuestionEditorAIAssist.tsx` (Zwischenzustand `pendingResult`, Preview-Block + Übernehmen/Verwerfen statt sofortigem `updateQuestion`). Optional: erläuterndes "?"-Tooltip neben den Buttons (Audit-Punkt "Funktionalitäten nicht erklärt").
- Akzeptanz: (1) Nach "Frage aus Thema" / "Distraktoren" erscheint zuerst eine Vorschau. (2) "Übernehmen" schreibt ins Formular, "Verwerfen" verwirft. (3) Hilfe-Tooltip erklärt beide Funktionen kurz. (4) Alle 5 Locales.

**WP-12 · Zeit-Einstellungen: Max-Validierung + Hilfetexte** · **P2** · `[CLIENT]`
- Scope: `QuestionEditorConfig` setzt nur `min` (cooldown ≥ 3, time ≥ 5). Sinnvolle Obergrenzen + Validierungs-/Fehlerhinweis bei ungültigen Werten ergänzen (Audit: "Bei ungültigen Werten gibt es keine Fehlermeldung"). Hilfetexte sind teils vorhanden (`questionDisplayHint`/`answerTimeHint`) — prüfen ob sie Min/Max benennen.
- Dateien: `features/quizz/components/QuestionEditor/QuestionEditorConfig/index.tsx` + `ConfigNumberInput.tsx` (max-Prop + Clamp + Inline-Hinweis), evtl. `packages/common/src/validators/quizz.ts` falls Server-Grenzen mitgezogen werden sollen (nur falls Hard-Limit gewünscht — sonst CLIENT). Hint-Texte um Min/Max ergänzen.
- Akzeptanz: (1) Werte werden client-seitig an Min/Max geclampt; ungültige Eingabe zeigt einen klaren Hinweis. (2) Hilfetexte nennen die erlaubte Spanne. (3) Alle 5 Locales.

**WP-13 · Antwort-Bilder (Bild pro Antwortoption)** · **P3** · `[BACKEND]` — *evaluieren, evtl. Non-Goal*
- Scope (Audit: "Für Antworten mit Bildupload sollte ein Bildvorschau-Feld eingeblendet werden"): Bild je Antwort. Heute ist `Question.answers` = `string[]` (Validator `quizz.ts`). Bild-pro-Antwort erfordert Umbau auf Objekte (`{text, image?}`), was Scoring (`round-manager.ts` liest Antworten per Index), Status-Payloads, alle gespeicherten Quizze (Migration) und die Spieler-Ansicht berührt.
- Dateien (falls verfolgt): `packages/common/src/validators/quizz.ts` + `types/game` (Answer-Schema), `packages/socket/src/services/round-manager.ts` (Scoring), `QuestionEditor/QuestionEditorAnswers.tsx`, Spieler-Render-Komponenten, Migrationspfad für Bestandsquizze.
- Akzeptanz: (nur wenn verfolgt) Schema migriert + abwärtskompatibel; Scoring unverändert korrekt; Spieler-Ansicht zeigt Antwort-Bilder. **Empfehlung: deferren** (großer Blast-Radius, niedriger Nutzen ggü. WebP-Single-Media pro Frage, das bereits existiert).

### G — Satellit

**WP-14 · Satellit: Fehler-Hinweise + Pairing-Visualisierung** · **P2** · `[CLIENT]`
- Scope: Konkrete Fehlerhinweise (z.B. "Firewall-Ports prüfen") durch Mapping bestehender `DISPLAY.PAIR_ERROR`-Codes auf Copy; klarere visuelle Darstellung des Koppelvorgangs (Code eingeben → Verbindung testen) im Tab. Einfache Sprache (Audit: "viele Nutzer technisch nicht versiert").
- Dateien: `configurations/ConfigDisplay.tsx` (Fehler-Copy + Stepper-Verfeinerung), `features/manager/.../DisplayControl*` (in-game Pairing — Fehlercode→Hinweis-Mapping), Locale-Files. Nur Copy + Mapping vorhandener Events.
- Akzeptanz: (1) Pairing-Fehler zeigen einen konkreten, laienverständlichen Hinweis. (2) Stepper macht den Ablauf (Code/Test) klar. (3) Alle 5 Locales.

**WP-15 · Satellit: Live-Status-Karte (Gerätename / letzter Ping)** · **P3** · `[BACKEND]`
- Scope: Wenn ein Gerät gekoppelt ist, Status (Name, online/offline, letzter Ping) anzeigen. Heute trackt die Registry nur Pairing-Code↔SocketId — kein `deviceName`/`lastSeen`/Heartbeat.
- Dateien: `packages/socket/src/services/registry.ts` (Status-Felder + Heartbeat), `packages/socket/src/handlers/display.ts` (Ping/Heartbeat-Event vom Display + Status-Push an Manager), neuer Manager-facing Status-Event in `constants.ts` EVENTS.DISPLAY, `configurations/ConfigDisplay.tsx` (Status-Karte).
- Akzeptanz: (1) Display sendet periodische Heartbeats. (2) Manager-Tab zeigt eine Live-Status-Karte (Name + online + letzter Ping). (3) Disconnect spiegelt sich im Status. (4) Alle 5 Locales.

### H — Vorschläge (Submissions)

**WP-16 · Submissions: Status-Historie (Approved/Rejected sichtbar)** · **P2** · `[CLIENT]`
- Scope: Heute zeigt das Tab nur `pending`. Eine Filter-Umschaltung (Offen / Angenommen / Abgelehnt) sichtbar machen — `status` ist bereits in `SubmissionMeta`. (Reiner Listen-Filter, kein Backend.)
- Dateien: `configurations/ConfigSubmissions.tsx` (Status-Filter-Chips, separate Listen-Sektionen statt nur `pending`).
- Akzeptanz: (1) Tab erlaubt Umschalten zwischen Offen/Angenommen/Abgelehnt. (2) Nav-Badge bleibt = Anzahl `pending`. (3) Alle 5 Locales.

**WP-17 · Submissions: Ablehnen-mit-Begründung + Kategorisierung** · **P3** · `[BACKEND]`
- Scope: (1) Beim Ablehnen optional einen Kommentar/Grund erfassen (für späteres Nutzer-Feedback). (2) Einreicher wählt bei der Einreichung eine Kategorie (z.B. neuer Fragetyp/Design/Funktion) — Audit-Punkt "Kategorien wählen, damit das Team priorisieren kann". `Submission` hat heute weder Reason noch Category/Tags, `REJECT_SUBMISSION`-Payload ist nur `{id}`.
- Dateien: `packages/common/src/types/submission.ts` (`rejectionReason?`, `category?`/`tags?`), `packages/common/src/validators/submission.ts`, `packages/socket/src/handlers/manager.ts` (`REJECT_SUBMISSION`-Payload um `reason` erweitern, persistieren), `configurations/ConfigSubmissions.tsx` (Reason-Eingabe im Reject-Dialog, Category-Badge), `pages/submit.*` (Category-Auswahl im öffentlichen Formular).
- Akzeptanz: (1) Reject kann einen Grund mitgeben, der persistiert wird. (2) Einreichungsformular bietet eine Kategorie-Auswahl, im Moderationstab als Badge sichtbar. (3) Validatoren akzeptieren die neuen optionalen Felder; Alt-Datensätze bleiben gültig. (4) Alle 5 Locales.

### I — Design / Theme

**WP-18 · Theme: Versionierung / "Vorherige Version wiederherstellen"** · ~~**P3** · `[BACKEND]`~~ · **DONE / OBSOLET**
> **Korrektur (erledigt):** Bereits umgesetzt via `THEME_REVISION.*` (Ring-Buffer in `config.ts`, `THEME_REVISIONS_MAX = 10` Snapshots, Restore-Event + Test `theme-revision.test.ts`) — die frühere "keine History"-Einschätzung war falsch.
- Scope: Audit-Punkt "Versionshistorie + Wiederherstellen". Heute nur Reset-auf-Default, keine History. Beim Speichern eine begrenzte Historie (z.B. letzte N) führen, Restore-Button anbieten.
- Dateien: `packages/common/src/types/theme.ts` (History/Revision-Konzept), `packages/socket/src/handlers/theme-template.ts` + `packages/socket/src/services/config.ts` (Revisions-Store + Restore-Event), `constants.ts` EVENTS.THEME_TEMPLATE (Restore/History-Events), `configurations/ConfigTheme.tsx` (History-Liste + Restore).
- Akzeptanz: (1) Theme-Speichern legt eine Revision an (begrenzte Tiefe). (2) "Vorherige Version wiederherstellen" lädt eine ältere Revision in den Draft. (3) Alle 5 Locales.

> Audit "Responsive Vorschau" (Theme): Die Live-Preview (`ThemePreviewPanel.tsx`) rendert bereits kompakte Mock-Screens (Join/Frage/Rangliste). Ein expliziter Mobile/Desktop-Umschalter ist **P3 [CLIENT]** und niedrigprior — die Karten sind schon schmal/telefonähnlich. Nur ziehen wenn explizit gewünscht.

### J — Cross-cutting

**WP-19 · Sprachkonsistenz-Audit (DE-Cleanup, Englisch-Reste)** · **P2** · `[CLIENT]`
- Scope: Audit-Punkt "Sprachliche Mischung" (Design/AI/Install tauchen englisch auf trotz DE). Tab-Labels und sichtbare Strings auf konsequentes Deutsch prüfen; "KI" statt "AI" wo nutzerseitig sichtbar; harte/englische Strings in deutsche Keys überführen.
- Dateien: `locales/de/*` (Konsistenz), Tab-`nameKey`s in `configurations/index.tsx`, Suche nach hartkodierten/englischen Strings über die Manager-Komponenten. Werkzeug: i18n-extractor-Stil-Scan über `features/manager` + `features/quizz`.
- Akzeptanz: (1) Keine englischen UI-Begriffe mehr im DE-Modus an sichtbaren Stellen. (2) Alle sichtbaren Strings laufen über i18n-Keys (keine Hardcodes). (3) EN/ES/FR/IT bleiben vollständig (keine fehlenden Keys).

**WP-20 · Keyboard-/Screenreader-A11y-Durchlauf** · **P2** · `[CLIENT]`
- Scope: Audit-Punkt "alle interaktiven Elemente per Tastatur erreichbar + Screenreader-Attribute". Viele Bausteine sind bereits gut (`aria-label`/`title`/Focus-Ring/Radiogroups). Ein gezielter Durchlauf über alle Tabs: Fokus-Reihenfolge, fehlende Labels, Modals (Fokus-Trap/Escape), `aria-live` für asynchrone Aktionen, Tab durch Editor-Slide-Rail.
- Dateien: querschnitt über `features/manager/components/configurations/*`, `console/*`, `features/quizz/components/*`. Keine neuen Features — nur Lücken schließen. Tooling: `chrome-devtools:a11y-debugging` / Lighthouse gegen `/manager/config`.
- Akzeptanz: (1) Jede Aktion per Tastatur erreichbar (kein Maus-only). (2) Modals trappen Fokus + schließen mit Escape. (3) Keine unbenannten interaktiven Elemente (axe/Lighthouse-a11y ohne kritische Findings). (4) Keine Regression an bestehenden Komponenten.

**WP-21 · Performance: Pagination/Lazy-Load für große Listen** · **P3** · `[CLIENT]`
- Scope: Audit-Punkt "Pagination/Lazy-Loading bei großen Datenmengen (Medienbibliothek, Ergebnisse)". Erst messen, dann optional virtualisieren/paginieren wenn Listen real groß werden. Bilder sind bereits `loading="lazy"`.
- Dateien: `configurations/ConfigMedia.tsx`, `configurations/ConfigResults.tsx`, `configurations/ConfigCatalog.tsx` (clientseitige "mehr laden"/Window-Slicing). Nur bei nachgewiesenem Bedarf.
- Akzeptanz: (1) Listen mit vielen Einträgen scrollen flüssig (kein spürbarer Jank). (2) Falls paginiert: konsistentes Muster über die Tabs. (3) Keine Regression.

---

## Non-goals / Risks

- **WP-22 · Rollen & Berechtigungen (Admin/Moderator/Editor/Viewer) = NON-GOAL für dieses Epic.** Heute existiert nur ein einzelnes Manager-Passwort (`packages/socket/src/services/manager.ts`, `loggedClients: Set`). Echtes RBAC ist Querschnitts-Auth-Arbeit (User-/Credential-Store, Rolle bei Login, Capability-Checks statt binärem `withAuth` in JEDEM Handler) — eigenes Epic, nicht hier mit-ziehen. Die Audit-Empfehlung "KI-Einstellungen nur für Admins" wird damit ebenfalls deferred (bis RBAC existiert, ist alles passwort-gegated).
- **PDF-Export server-seitig = NON-GOAL.** CSV reicht (WP-8, client-seitig); PDF ggf. via Browser-Print einer Print-CSS, kein Server-Renderer.
- **Quiz-Export-Bundle (mehrere Quizze als eine Datei) = deferred.** Pro-Quiz-Export existiert via vorhandenem Pfad; ein Server-Bundle-Endpoint lohnt den Aufwand nicht.
- **WebP-only bleibt harter Constraint** — alle Medien-/Bild-WPs (WP-5, WP-6, WP-10) dürfen die WebP-Pipeline nicht umgehen.
- **Keine Regression an Shipped-Features.** Insbesondere: ConsoleShell Single-Scroll-Owner nicht brechen (kein nested-overflow das Mobile-Scroll trappt — siehe Memory `nested-scroll-trap-fix`), Theme-Preview-Isolation (`ThemePreviewPanel` schreibt NIE auf `documentElement`) bewahren, CD-Deploy-Race beachten (Features batchen, siehe Memory `cd-deploy-race-condition`).
- **WP-13 (Antwort-Bilder) Risiko:** großer Schema-Blast-Radius (Scoring, Migration, Spieler-UI). Empfehlung: nur auf explizite Anforderung.
- **Bonus/Übung sind bereits mutually-exclusive** — der Audit-Punkt ist erledigt; nicht versehentlich "neu" bauen.

---

## Suggested sequencing (Multi-Agent-Flood, disjunkte Dateien)

**Welle 1 — P1 Quick-Wins, client-only, weitgehend disjunkt (parallel floodbar):**
- WP-1 (Editor Datenverlust) → `quizz-editor-context.tsx` + `QuizzEditorHeader.tsx`
- WP-2 (Quiz Suche/Sort/Dup-Confirm) → `ConfigManageQuizz.tsx`
- WP-4 (Editor Media-Picker) → neues `MediaPickerModal.tsx` + `QuestionEditorMedia.tsx`
- WP-7 (Ergebnisse Filter + Anonymisieren) → `ConfigResults.tsx` + `ResultModal/*`
  - Disjunkt: 1 berührt quizz-context/header, 2 ConfigManageQuizz, 4 Editor-Media, 7 Results/ResultModal. Kein Overlap → 4 Agents parallel.

**Welle 2 — P2 client-only (parallel, andere Dateien):**
- WP-3 (Quiz Bulk) → `ConfigManageQuizz.tsx` (**nach WP-2**, gleiche Datei → sequenziell zu WP-2)
- WP-5 (Media DnD + Bulk) → `ConfigMedia.tsx`
- WP-8 (CSV-Export) → neuer `resultExport.ts` + `ResultModalHeader.tsx` (**nach/parallel WP-7**, andere Datei im selben Feature → koordinieren)
- WP-9 (AI Datenschutz/Slider) → `ConfigAI.tsx`
- WP-11 (AI-Assist Preview) → `QuestionEditorAIAssist.tsx`
- WP-12 (Zeit-Validierung) → `QuestionEditorConfig/*`
- WP-14 (Satellit Fehler-Copy) → `ConfigDisplay.tsx` + DisplayControl
- WP-16 (Submissions Status-Filter) → `ConfigSubmissions.tsx`
- WP-19 (Sprach-Audit) → `locales/*` + `configurations/index.tsx` (**zuletzt in der Welle**, da es Strings aus den anderen WPs mit-erfasst)

**Welle 3 — P2 a11y/Querschnitt (nach Funktions-WPs, da sie über die neuen Komponenten laufen):**
- WP-20 (A11y-Durchlauf) — querschnitt, **nach** Welle 1+2

**Welle 4 — P3 / Backend (eigene Branches, koordiniert wegen `packages/common`+`packages/socket`):**
- WP-6 (Media-Dimensionen), WP-10 (AI-Parameter), WP-15 (Satellit Live-Status), WP-17 (Submission Reject-Grund/Kategorie), WP-18 (Theme-Versionierung), WP-21 (Performance, nur bei Bedarf), WP-13 (Antwort-Bilder, optional/deferred).
  - Diese teilen sich `constants.ts` (EVENTS) und Validatoren — seriell oder mit klarer Datei-Aufteilung mergen, um EVENTS-Konflikte zu vermeiden.

**Konvention:** Jeder WP = eigene Work-Package gegen diese Akzeptanzkriterien, neue Strings in alle 5 Locales, `useReducedMotion` respektieren, Touch-Targets ≥ 44px, `design-validator`/a11y-Check vor Merge, Features für CD-Deploy batchen.
