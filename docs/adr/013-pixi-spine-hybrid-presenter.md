# ADR-013: PixiJS + Motion + hierarchische Puppet-Rigs — v2 (2026-07-30)

**Status:** Accepted  
**Datum:** 2026-07-30  
**Owner:** WP-01 / codex, WP-H1  
**Betroffene Bereiche:** Visuelle Razzoozle-Spielmodi (flower-battle, pyramid-climb, deep-sea-escape), Presenter-Canvas, Assetpipeline  
**Supersedes:** ADR-012 (teilweise, Presenter-Canvas-Scope; UI-Animations in ADR-012 bleiben gültig)  
**Ersetzt:** v1 (2026-07-30), Entwürfe mit Spine- oder Rive-Runtime  
**Git-Historie:** `git log --all -- docs/adr/013-* docs/design/anim-runtime-research-2026-07-30.md`

---

## Kontext

Razzoozle benötigt für drei Spielmodi (Blüten-Battle, Pyramiden-Aufstieg, Tiefsee-Flucht) hochwertige 2D-Cartoon-Animationen im Web. Die Spielmodi werden in eine bestehende Anwendung integriert und müssen deren Multiplayer-, Punkte-, Strike-, Zeitbonus-, Badge- und Achievement-Systeme wiederverwenden.

Anforderungen:

- keine zweite Game-State- oder Punkteengine
- serverautoritäre Spielzustände
- responsive Presenter-Ansicht
- kleine und modulare Dateien
- kontrollierbare Assetpipeline
- niedrige Bundle- und Lizenzkomplexität
- gute Testbarkeit
- reduzierte Animationen und Fallback
- keine Abhängigkeit von kostenpflichtigen Authoring-Tools
- möglichst reine permissive Software-Lizenzkette
- Wiederverwendung von Rig-/Animations-Core über mehrere Modi

---

## Entscheidung

Wir verwenden:

```text
PixiJS 8
+ das bereits im Projekt vorhandene Paket motion (12.42.2, MIT)
+ hierarchische PixiJS-Container und Sprites als Puppet-Rig
+ Modus-Events als Payloads im bestehenden game:experience-Envelope
```

Wir verwenden nicht:

```text
Spine
Rive
GSAP als Standarddependency
neue Top-Level-Socket-Events
```

Motion ist die Primary-Animation-Library. GSAP bleibt nur eine dokumentierte Fallback-Option für einen später nachgewiesenen Funktionsbedarf, der mit Motion nicht vertretbar abgebildet werden kann.

---

## Begründung

### PixiJS

PixiJS stellt den Scene Graph, Container, Sprites, Transformationen, Assets, Particles sowie WebGL-/WebGPU-Rendering bereit. Container vererben Position, Rotation, Skalierung und Alpha an ihre Kinder; der Pivot definiert Gelenkpunkte. Dies reicht für Cutout-/Puppet-Animationen der vorgesehenen Figuren.

Lizenz: MIT.

### Motion

Motion ist bereits im Projekt vorhanden (12.42.2), steht unter MIT und kann neben DOM-/SVG-Elementen auch JavaScript-Objekte und einzelne Werte animieren. PixiJS-Objekte und deren `position`, `scale`, `rotation` und eigene Rig-Werte können daher ohne neue Animationsdependency getweent werden.

Konsequenz:

- null neue Animationsdependencies
- einheitliche Tween- und Sequenz-API
- testbare TypeScript-Sequenzen
- kontrolliertes Stoppen und Cleanup
- reine MIT-Softwarekette für PixiJS und Motion

### Puppet-Rig

Ein Puppet-Rig wird aus verschachtelten PixiJS-Containern aufgebaut. Arme, Beine, Kopf, Gesicht und weitere Teile sind einzelne Sprites. Gelenkpunkte werden über `pivot` und Rig-Metadaten definiert.

Vorteile:

- kein proprietäres Dateiformat
- keine Editor-/Runtime-Kopplung
- Assets können mit normalen Grafikwerkzeugen erstellt werden
- Sequenzen liegen im Quellcode und sind code-reviewbar
- einfache Reduced-Motion-Varianten
- einfacher Sprite-Fallback
- gute Integration mit serverautoritativen Events

### Modus-Integration: game:experience-Envelope

Alle Modus-Events (growth_changed, power_up_applied etc.) fließen als strukturierte Payloads im bestehenden `game:experience`-Socket-Envelope (Revision/Reconnect-Resend/ts-rs/display-room). Keine neuen Top-Level-Events. Dies sichert Konsistenz, Resync-Semantik und Testbarkeit.

### Shared-Core: Extraction ab zwei Nutzern

Das gemeinsame Puppet/Motion-Core entsteht **IN** flower-battle, wird dort getestet und iteriert. Extraktion nach `packages/web/src/experiences/shared/` erfolgt erst beim **ZWEITEN realen Nutzer** (pyramid-climb). Dabei:

- Gemeinsame Puppet-/Rig-Klassen extrahieren
- Motion-Adapter mit Modus-Hooks (custom Tween-Factories pro Modus)
- Rig-Definitionsformat vereinbaren
- Assetpipeline-Templates für neue Modi

Ziel: Vermeidung von vorweggenommener Abstraktion; Architektur lernt aus echtem Gebrauch.

---

## Verifizierte Alternativen

### Spine

Nicht gewählt.

Gründe:

- zusätzliche Runtime
- zusätzliche Editor-/Exportpipeline
- versionsgebundene Runtime-/Exportkompatibilität
- zusätzliche Lizenzprüfung
- für die vorgesehenen Cutout-Rigs nicht zwingend erforderlich

### Rive

Nicht gewählt.

Der kostenlose Editor erlaubt das Erstellen und Lernen; das Exportieren von `.riv`-Dateien für Runtime-Nutzung ist auf bezahlte Pläne beschränkt. Dadurch entsteht kein geeigneter freier Produktionsworkflow für das Projekt.

### GSAP

Nicht als Standard gewählt.

GSAP ist seit dem 30.04.2025 vollständig kostenlos nutzbar. Es gilt jedoch die Webflow/GSAP Standard License und nicht MIT. Motion deckt den primären Bedarf bereits ab und befindet sich im Projekt.

GSAP darf später nur eingesetzt werden, wenn:

1. ein konkretes Motion-Defizit reproduzierbar dokumentiert ist
2. die Architekturprüfung zustimmt
3. die Lizenzprüfung die Nutzung freigibt
4. die neue Dependency und Bundlewirkung akzeptiert werden
5. ein isolierter Adapter die Austauschbarkeit sicherstellt

### AnimatedSprite-only

Nicht als einziges Animationsmodell gewählt.

Spritesheets eignen sich für Effekte und Fallback, erzeugen bei vielen Figurenvarianten jedoch viele Frames und erschweren dynamische Gesichts-, Farb- und Teilvarianten. Sie bleiben Bestandteil des Systems, aber nicht primäres Actor-Rig.

---

## Technisches Muster

```text
PuppetActor
├── root: Container
├── bodyJoint: Container
├── headJoint: Container
├── armLeftJoint: Container
├── armRightJoint: Container
├── legLeftJoint: Container
├── legRightJoint: Container
├── faceController
├── poseMixer
└── animationController
```

Motion animiert:

- `Container.position`
- `Container.scale`
- `Container.rotation`
- `Container.alpha`
- Sprite-Tint beziehungsweise definierte Farbwerte
- eigene numerische Poseparameter

Nicht animiert werden:

- fachliche Punkte
- serverautoritäre Fortschrittswerte
- Gewinnerentscheidungen
- Antwortresultate
- Teamaggregation

---

## Assetentscheidung

Zentrale Figuren und Hauptkulissen werden als eigene Razzoozle-Assets produziert.

CC0-Assets dürfen für Ambient-Elemente, Partikel, Lichtmasken, Blockouts und ausgewählte Produktionsobjekte verwendet werden. Primäre Quelle ist Kenney, da die Assetseiten CC0 ausweisen und Attribution nicht verlangen.

Verbindlich:

- jede konkrete Assetseite prüfen
- Assets lokal übernehmen, nicht remote hotlinken
- nur benötigte Dateien in Runtime-Bundles
- `SOURCES.md` mit Quelle, Lizenz, Änderungen und Importdatum
- zentrale Figuren nicht aus stilistisch unpassenden Assetpacks zusammensetzen
- fremde Markenassets nicht übernehmen

---

## Beispielcode und Referenzprojekte

PixiJS Open Games darf als MIT-Code-Referenz für Screen-Lifecycle, Asset-Bundles, Settings, UI-Struktur und Effekte genutzt werden.

Einschränkung:

- Figma-Dateien sind nur zur Ansicht
- enthaltene Grafiken und Designassets werden nicht übernommen
- Spine- und GSAP-spezifische Teile werden nicht kopiert
- Code wird nur gezielt und angepasst integriert

---

## Konsequenzen

### Positiv

- keine neue Animationsdependency
- MIT-lizenzierte Softwarekette
- keine kostenpflichtige Exportpipeline
- klare Ownership im TypeScript-Code
- guter Fallback
- einfache Tests
- Wiederverwendung über mehrere Modi (gelernt aus flower-battle)
- Assetparts können dynamisch eingefärbt und ausgetauscht werden
- Envelope-Sicherheit: Game-Events bleiben in autoritative Verantwortung

### Negativ

- kein visueller Skeletteditor
- Rig-Pivots und Animationen müssen im eigenen Workflow gepflegt werden
- komplexe Mesh-Deformation ist nicht vorgesehen
- hochwertige Animation benötigt klare Posebibliothek und Art-Disziplin
- Rigging-Tools müssen gegebenenfalls als kleines internes Devtool ergänzt werden

### Risiken

| Risiko | Massnahme |
|---|---|
| zu viele manuell gepflegte Posewerte | zentrale Pose-Library und Rig-Validator |
| Motion-Controls werden nicht gestoppt | Cleanup Registry und AbortSignal |
| verschiedene Modi bauen eigene Rigsysteme | gemeinsames Modul erst nach zwei realen Nutzern extrahieren |
| CC0-Assets wirken stilistisch inkonsistent | Art-Pass und Palette-/Konturregeln |
| komplexe Figur braucht Deformation | Figur vereinfachen oder Spritesheet nur für diese Sequenz |
| Motion reicht für Spezialfall nicht | GSAP-Fallbackprozess gemäss ADR |

---

## Implementierungsvorgaben

1. Motion-Version (12.42.2) aus Lockfile dokumentieren.
2. Keine Installation einer weiteren Tween-Bibliothek vor Architekturprüfung.
3. `MotionPixiAdapter` erstellen.
4. Animationen mit `AbortSignal` abbrechbar machen.
5. Puppet-Rig aus PixiJS-Containern aufbauen.
6. Rigdefinition in versioniertem JSON oder TypeScript halten.
7. Posen und Sequenzen typisieren.
8. Fallback über Spritesheets oder statische Sprites.
9. `prefers-reduced-motion` berücksichtigen.
10. Assetquellen und Lizenzen dokumentieren.
11. Mount/Unmount- und Speicherlecks testen.
12. Fachliche Events und visuelle Sequenzen strikt trennen.
13. Events nur im `game:experience`-Envelope, nie als Top-Level-Emissions.

---

## Abnahmekriterien

- PixiJS und Motion sind die einzigen Runtime-Bausteine für das Puppet-System.
- Keine Spine- oder Rive-Abhängigkeit im Runtime-Bundle.
- Kein GSAP im Standardbundle (nur bei nachgewiesener Notwendigkeit nach Architekturprüfung).
- Ein Puppet mit mindestens fünf beweglichen Teilen funktioniert.
- Idle, Anticipation, Hauptbewegung, Treffer und Celebration sind implementiert.
- Animationen sind abbrechbar.
- Reduced Motion funktioniert.
- Reconnect kann Actorposition und Pose auf Snapshot korrigieren.
- Alle Modus-Events fließen durch `game:experience`-Envelope.
- Assetquellenliste ist vorhanden.
- Lizenz- und Research-Dokumentation ist eingecheckt.
- Tests für Adapter, Posemixer, Queue und Cleanup sind grün.
- Shared-Core-Extraction-Entscheidung im Backlog verankert (nach flower-battle + pyramid-climb Live-Test).

---

## Quellen

- Motion: https://motion.dev/
- Motion Quick Start: https://motion.dev/docs/quick-start
- Motion `animate()`: https://motion.dev/docs/animate
- Motion `propEffect()`: https://motion.dev/docs/prop-effect
- Motion MIT License: https://github.com/motiondivision/motion/blob/main/LICENSE.md
- Motion version 12.42.2: pnpm-lock.yaml
- PixiJS Scene Objects: https://pixijs.com/8.x/guides/components/scene-objects
- PixiJS Assets: https://pixijs.com/8.x/guides/components/assets
- PixiJS MIT License: https://github.com/pixijs/pixijs/blob/dev/LICENSE
- GSAP Free Announcement: https://webflow.com/updates/gsap-becomes-free
- GSAP Standard License: https://gsap.com/community/standard-license/
- Rive Pricing: https://rive.app/pricing
- Rive Runtime Export: https://rive.app/docs/editor/exporting/exporting-for-runtime
- PixiJS Open Games: https://github.com/pixijs/open-games
- Kenney License FAQ: https://kenney.nl/support
