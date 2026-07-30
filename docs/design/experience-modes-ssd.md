# System Structure Document (SSD): Consolidierte Experience-Modi

**Status:** Accepted (User-Direktive 2026-07-30)  
**Stand:** 30.07.2026  
**Scope:** Razzoozle Presenter Canvas & Experience-Architektur (Blüten-Battle, Pyramiden-Aufstieg, Tiefsee-Flucht)  
**Referenzen:** [ADR-013](../adr/013-pixi-spine-hybrid-presenter.md), [SDD-FB](flower-battle-pixi-spine-sdd.md), [SDD-Pyramid](pyramid-climb-pixi-motion-sdd.md), [SDD-DeepSea](deep-sea-escape-pixi-motion-sdd.md)

---

## 1. System Overview

Der Razzoozle Presenter stellt interaktive 2D-Cartoon-Szenen für drei Spielmodi bereit. Alle Modi teilen sich eine einheitliche Canvas-Host- und Presenter-Architektur, verwenden PixiJS 8 für das Rendering und nutzen die vorhandene `motion`-Bibliothek für prozedural getweente Puppet-Rigs (ohne Spine-Runtime gemäss [ADR-013](../adr/013-pixi-spine-hybrid-presenter.md)).

### 1.1 Übersicht der Spielmodi

| Spielmodus | Spielmechanik | Spieler-Agency | Presenter-Fokus | Haupt-Wire-Events |
|---|---|---|---|---|
| **Blüten-Battle** | Team-Pflanzenwachstum durch richtige Antworten & Power-ups | Antworten, Geschwindigkeit, Power-Up-Voting/Targeting | Parallax-Garten, Blumenskelett-Wachstum, Bloom/Wilt-Animationen, Partikeleffekte | `growth_changed`, `power_up_applied`, `power_up_expired`, `stage_up`, `team_overtaken`, `round_start`, `round_end`, `state_reconciled` |
| **Pyramiden-Aufstieg** | Stufen-Aufstieg/-Abstieg basierend auf Antwort & Confidence | Antworten + Confidence Rating (Höhe vs. Risiko) | Vertikaler Scroll/Parallax, Stufenklettern, Rutschen/Stürzen, Tempelspitze | `team_movement_resolved` |
| **Tiefsee-Flucht** | U-Boot/Taucher-Propulsion vs. Ozeantiefen-Bedrohung | Kollektive Antworten, Geschwindigkeits-Boost | Unterwasser-Parallax, U-Boot-Antrieb, Kraken-Tentakel, Tiefenmeter | `escape_round_resolved` |

> **Hinweis Blüten-Battle-Events:** Die gelistete Granular-Event-Liste (`growth_changed`, `power_up_applied`, ...) ist die **Ziel-Event-Taxonomie der PixiJS-Ära** (Mapping vom `Domain-Event-Adapter`/`EventQueue` in WP-06/07). Live-Wire heute ist stattdessen ein state-snapshot-förmiger `flowerBattle`-Payload im `game:experience`-Envelope (`ExperienceTransition.payload.data.state: FlowerBattleState` mit `phase`, `teams: FlowerBattleTeamState[]`, `background`, `powerups` — `packages/common/src/types/game/experience.ts`), keine granularen Einzel-Events.

### 1.2 Visuelle Ebenen und Puppet-Rig Struktur per Modus

| Spielmodus | Foreground Layer | Middleground / Rig Layer | Background / Parallax Layer | Puppet Rig Anatomie |
|---|---|---|---|---|
| **Blüten-Battle** | HUD, Score-Pills, Power-Up Overlays | Blumen-Rigs, Wachstums-Stängel, Blütenblätter, Effekte | Sky Gradient, Wolken, Hügel, Garten-Deko | Root Anchor $\rightarrow$ Stem Segments $\rightarrow$ Leaves & Petals $\rightarrow$ Face Container (Augen, Mund) |
| **Pyramiden-Aufstieg** | Tempel-Vordergrund, Ranken, Leader-Marker | Pyramiden-Stufen, Kletterer-Rigs, Staubwolken, Fallen | Wüstensand, Pharaonen-Monumente, Sonne/Himmel | Root Anchor $\rightarrow$ Torso Container $\rightarrow$ Limbs (Arme, Beine) $\rightarrow$ Head & Outfit/Color Slot |
| **Tiefsee-Flucht** | Tiefenmeter, Sauerstoff-HUD, Sonar-Pulse | U-Boot Chassis, Propeller, Kraken-Tentakel, Bubbles | Dunkler Ozean-Verlauf, Unterwasser-Ruinen, Lichtkegel | Hull Anchor $\rightarrow$ Thruster/Propeller $\rightarrow$ Periscope/Cockpit $\rightarrow$ Kraken Arm Segments |

### 1.3 Shared Presenter Architektur

Die Presenter-Architektur ist modular aufgebaut und trennt Rendering, Animations-Engine und Netzwerk-Reconciliation:

```text
+-----------------------------------------------------------------------------------+
|                                   CanvasHost                                      |
|   (React DOM Container, WebGL Context Lifecycle, Viewport Resize & Motion Query)   |
+----------------------------------------+------------------------------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
+--------v--------+             +--------v--------+             +--------v--------+
| MotionPixiAdapter|            |   PuppetCore    |             | QualityProfiler |
| (motion MIT)    |             | (Hierarchical   |             | (FPS & Frame    |
| Tweens & Curves |             |  Container Rigs)|             |  Tier Auto-Downgrade)
+--------+--------+             +--------+--------+             +--------+--------+
         |                               |                               |
         +-------------------------------+-------------------------------+
                                         |
+----------------------------------------v------------------------------------------+
|                             EventQueue & StateReconciler                          |
|    (game:experience-Envelope, Monotonic Revision #, Snapshot v7 Synchronization)   |
+-----------------------------------------------------------------------------------+
```

- **CanvasHost:** React-Wrapper für das PixiJS `HTMLCanvasElement`, verwaltet WebGL2/WebGPU Context-Lost/Restored-Events und Viewport-Skalierung (`h-full`, parent-relative per ADR-013).
- **MotionPixiAdapter:** Brücke zwischen `motion` (12.42.2, MIT) und PixiJS-Objekten (`position`, `scale`, `rotation`, `alpha`, Pivot-Gelenke).
- **PuppetCore:** Prozedurale Skelett-Rigs aus hierarchischen PixiJS `Container`-Knoten mit Ankerpunkten und austauschbaren Sprite-Slots.
- **QualityController / QualityProfiler:** Laufzeit-Performance-Überwachung (FPS, Render-Dauer) mit automatischem Downgrade (High $\rightarrow$ Medium $\rightarrow$ Low $\rightarrow$ Static Tier).
- **AssetPipeline / AssetLoader:** PixiJS Assets Bundle Loader mit Namespace-Isolierung (`fb:*`, `pyr:*`, `dse:*`), Sprite-Sheets und Sound-Preloading.
- **EventQueue:** Inbound Event-Puffer für geordnete Animationssequenzierung ohne Blockieren des Backend-Zustands.
- **StateReconciler:** Monotoner Revisions-Abgleich (`serverRevision`), Idempotenz-Prüfung und Hard-Sync bei Verbindungsunterbrechungen.

### 1.4 Tech Stack Constraints

- **Rendering:** PixiJS 8 (MIT)
- **Primary Animation:** `motion` 12.42.2 (MIT, bereits im Repo)
- **Secondary Fallback:** GSAP (Webflow No-Charge, nur bei nachgewiesenem Bedarf für seltene Pfad-Tweens)
- **Rigging:** Procedural Puppet-Rigs (Spine-free gemäss [ADR-013](../adr/013-pixi-spine-hybrid-presenter.md))
- **Netzwerk:** `game:experience`-Envelope über bestehende Razzoozle WebSockets

### 1.5 State-Sync & Reconnect Machinery (#939, #959)

1. Server sendet strikt monotone `serverRevision` im `game:experience`-Envelope.
2. Bei Reconnect fordert der Client nichts an: der Server resendet unaufgefordert und idempotent den aktuellen `ExperienceTransition`-Envelope an genau den rejoinenden Socket, ohne die Revision zu erhöhen (`resend_experience_on_display_reconnect`, `rust/server/src/socket/status_emit.rs`, aufgerufen aus `rust/server/src/socket/manager/auth.rs`, WP #939B). Es gibt weder ein Feld für die zuletzt gesehene Client-Revision noch einen aktiven Client-Resync-Request.
3. Der `StateReconciler` storniert laufende Tweens bei Re-Sync und gleicht die Presenter-Szene direkt an Snapshot v7 an.

---

## 2. User Decisions (2026-07-30)

Die folgenden verbindlichen Vorgaben sind im Gesamtsystem verankert:

1. **Tech Stack Bestätigt:** PixiJS 8 ✓ + Motion (MIT) ✓ + GSAP Fallback ✓. Alle Modi arbeiten vollständig Spine-frei mit prozeduralen Puppet-Rigs.
2. **Rollout-Reihenfolge:**
   - **Phase 1 (Blüten-Battle):** WP-02..14 vollständig umsetzen und releasen.
   - **Phase 2 (Pyramiden-Aufstieg):** W0+ (Design Lock & Implementation) startet nach Blüten-Battle Release.
   - **Phase 3 (Tiefsee-Flucht):** W0+ (Design Lock & Implementation) startet nach Pyramide Release.
3. **Shared-Core Extraction Trigger:** Die Extraktion des gemeinsamen Puppet/Motion-Cores aus `flower-battle` nach `packages/web/src/experiences/shared/` erfolgt genau beim Start des **zweiten Nutzers** (Pyramiden-Aufstieg).
4. **Envelope Wire-Contract Finalisiert:**
   - Einziger WebSocket-Kanal: `game:experience`.
   - Modus-spezifische Payloads: `team_movement_resolved` für Pyramide, `escape_round_resolved` für Tiefsee.
5. **Alt-Cluster Superseded:** Frühere Vorschläge (#884/#892, Umbrellas #900/#948) sind superseded. Valide Sub-Konzepte wie ModeOutcome-Hook (#933) und ModeCard-Persistence (#960) sind integriert.

---

## 3. Module Matrix

### 3.1 Repository-Struktur per Spielmodus

Live-Code-Konvention (verifiziert: `packages/web/src/experiences/flower-battle/`): alle Modi siedeln unter `packages/web/src/experiences/<mode>/`, der gemeinsame Kern unter `packages/web/src/experiences/shared/`. Ein Pfad mit `features/<mode>/` statt `experiences/<mode>/` als zweitem Segment existiert im Repository nicht — der `features`-Ordner bleibt reserviert für app-weite Feature-Module (`experience`, `experience-kit`, `game`, `manager`, `quizz`, ...), nicht für Spielmodus-Presenter.

| Spielmodus | Repository Path | Initialer Zustand | Extraktions-Trigger | Finaler Extracted Location |
|---|---|---|---|---|
| **Blüten-Battle** | `packages/web/src/experiences/flower-battle/` | In-Feature integriert | 2. Modus Integration | `packages/web/src/experiences/shared/` |
| **Pyramiden-Aufstieg** | `packages/web/src/experiences/pyramid-climb/` | Shared-Core Nutzung | Löst Extraktion aus | `packages/web/src/experiences/shared/` |
| **Tiefsee-Flucht** | `packages/web/src/experiences/deep-sea-escape/` | Shared-Core Nutzung | Nach Extraktion | `packages/web/src/experiences/shared/` |

### 3.2 Gemeinsame Kernel-Module (Shared Core)

| Modulname | Erstansiedlung | Hauptschnittstelle / Signature | Zweck / Verantwortung | Extraktionsziel |
|---|---|---|---|---|
| `ExperiencePixiApp` | WP-05 (Flower Battle) | `init(container: HTMLElement): Promise<void>` | PixiJS Application Lifecycle, Render-Loop, Viewport-Resize | `packages/web/src/experiences/shared/stage/` |
| `MotionPixiAdapter` | WP-04 (Flower Battle) | `animatePixiTarget(target: Container, props: AnimProps)` | Adapter-Klasse für `motion`-Tweens auf PixiJS DisplayObjects | `packages/web/src/experiences/shared/animation/` |
| `PuppetRigFactory` | WP-08 (Flower Battle) | `createPuppetRig(spec: RigSpec): PuppetContainer` | Erzeugung von Container-Hierarchien, Gelenk-Pivots & Rig-Bones | `packages/web/src/experiences/shared/puppet/` |
| `QualityProfiler` | WP-11 (Flower Battle) | `getCurrentTier(): PerformanceTier` | Laufzeit-FPS-Messung, Frame-Time-Heuristik & Tier-Downgrade | `packages/web/src/experiences/shared/quality/` |
| `EventQueue` | WP-07 (Flower Battle) | `enqueue(event: ExperienceEvent): void` | Entkopplung von WebSocket-Events und Grafik-Animationen | `packages/web/src/experiences/shared/network/` |
| `StateReconciler` | WP-07 (Flower Battle) | `reconcile(snapshot: SnapshotV7): void` | Revisions-Abgleich & Idempotenz-Enforcement für Snapshot v7 | `packages/web/src/experiences/shared/network/` |
| `AssetLoader` | WP-03 (Flower Battle) | `loadBundle(namespace: string): Promise<AssetMap>` | Bundled Loader mit Namespace-Prefixing (`fb:`, `pyr:`, `dse:`) | `packages/web/src/experiences/shared/assets/` |
| `AudioAdapter` | WP-09 (Flower Battle) | `playCue(soundId: string): void` | WebAudio / Event-getriebene Sound-Auslösung (§12 SDD-FB, cross-cutting, erste Cues bei Growth/Bloom-Reaktionen) | `packages/web/src/experiences/shared/audio/` |

---

## 4. Wire-Contract Chapter

Alle Spielmodi senden und empfangen Nachrichten über das standardisierte `game:experience`-Envelope.

### 4.1 Inbound Events overview

- **Flower Battle (Ziel-Event-Taxonomie, PixiJS-Ära — Mapping in WP-06/07):** `growth_changed`, `power_up_applied`, `power_up_expired`, `stage_up`, `team_overtaken`, `round_start`, `round_end`, `state_reconciled` ([SDD-FB §4.3](flower-battle-pixi-spine-sdd.md)). Live-Wire heute: state-snapshot-förmiger `flowerBattle`-Payload (`ExperienceTransition.payload.data.state: FlowerBattleState`, `packages/common/src/types/game/experience.ts`), keine Einzel-Events.
- **Pyramid Climb:** `team_movement_resolved` ([SDD-Pyramid §4.4](pyramid-climb-pixi-motion-sdd.md))
- **Deep Sea Escape:** `escape_round_resolved` ([SDD-DeepSea §4.4](deep-sea-escape-pixi-motion-sdd.md))

### 4.2 JSON Schema Sketches

#### Envelope-Wrapper (All Modes)

```json
{
  "type": "game:experience",
  "mode": "pyramid_climb",
  "serverRevision": 104,
  "timestamp": 1785427200000,
  "eventId": "evt_pyr_88301",
  "payload": {}
}
```

#### Flower Battle Payload (`growth_changed`)

```json
{
  "eventType": "growth_changed",
  "teamId": "team_alpha",
  "previousHeight": 110.0,
  "newHeight": 135.5,
  "delta": 25.5,
  "growthStage": 3,
  "isStreakBonus": true
}
```

#### Flower Battle Payload (`power_up_applied`)

```json
{
  "eventType": "power_up_applied",
  "powerUpType": "sunburst",
  "sourceTeamId": "team_alpha",
  "targetTeamId": "team_beta",
  "durationMs": 5000,
  "multiplier": 1.5
}
```

#### Pyramid Climb Payload (`team_movement_resolved`)

```json
{
  "eventType": "team_movement_resolved",
  "roundNumber": 4,
  "teamMovements": [
    {
      "teamId": "team_red",
      "previousStep": 8,
      "newStep": 11,
      "deltaSteps": 3,
      "confidence": "high",
      "isFall": false
    },
    {
      "teamId": "team_blue",
      "previousStep": 9,
      "newStep": 8,
      "deltaSteps": -1,
      "confidence": "high",
      "isFall": true
    }
  ],
  "leaderTeamId": "team_red"
}
```

#### Deep Sea Escape Payload (`escape_round_resolved`)

```json
{
  "eventType": "escape_round_resolved",
  "roundNumber": 3,
  "depthMeters": 350,
  "propulsionSpeed": 12.8,
  "threatLevel": 0.45,
  "hazardTriggered": "kraken_tentacle",
  "teamStatus": [
    {
      "teamId": "team_green",
      "shieldActive": true,
      "oxygenPct": 95.0,
      "positionMeters": 140
    }
  ]
}
```

### 4.3 Revision & Idempotency Rules

1. `serverRevision` erhöht sich mit jedem autoritativen Status-Update strikt monoton.
2. Der `StateReconciler` verarbeitet jedes `eventId` genau einmal (Idempotenz-Set mit Sliding-Window 500).
3. Bei Ankunft veralteter Reversionen (`serverRevision <= lastAppliedRevision`) wird das Event ohne Animation verworfen.
4. Bei Reconnect fordert der Client nichts aktiv an — der Server resendet unaufgefordert den aktuellen Envelope an genau den rejoinenden Socket (siehe §1.5.2); der `StateReconciler` bricht aktive Tweens ab und snappt auf den empfangenen Snapshot v7 Zustand.

---

## 5. Server Chapter

### 5.1 ModeOutcome-Hook Integration (#933)

Der Rust Backend Game-Actor bindet nach jeder Runden-Auswertung einen standardisierten `ModeOutcome-Hook` ein:

```text
[Rust Game Loop] ---> (Round Finished) ---> [ModeOutcome-Hook (#933)]
                                                   |
         +-----------------------------------------+-----------------------------------------+
         |                                         |                                         |
         v                                         v                                         v
evaluate_flower_battle_growth()          evaluate_pyramid_climb_step()            evaluate_deep_sea_escape_round()
 (Calculates growth delta & stage)        (Applies Confidence Rating policy)        (Applies Propulsion vs. Threat policy)
```

```rust
// Standardisierte Hook-Schnittstelle im Backend Game-Actor
pub fn handle_mode_outcome(
    game_state: &mut GameState,
    mode: ExperienceMode,
    round_result: &RoundResult,
) -> ModeOutcomePayload {
    match mode {
        ExperienceMode::FlowerBattle => evaluate_flower_battle_growth(game_state, round_result),
        ExperienceMode::PyramidClimb => evaluate_pyramid_climb_step(game_state, round_result),
        ExperienceMode::DeepSeaEscape => evaluate_deep_sea_escape_round(game_state, round_result),
    }
}
```

### 5.2 Rust-Engine Logic per Mode

- **Flower Battle:** Keine neue Rust-Engine. Nutzt bestehendes Multiplayer-Scoring, Streak-Punkte und Power-up State.
- **Pyramid Climb (`ClimbResolutionPolicy`):** Berechnet Stufen-Deltas basierend auf `ConfidenceRating`:
  - High Confidence: Richtig = +3 Stufen, Falsch = -2 Stufen (Rutschen/Sturz)
  - Medium Confidence: Richtig = +2 Stufen, Falsch = -1 Stufe
  - Low Confidence: Richtig = +1 Stufe, Falsch = 0 Stufen
- **Deep Sea Escape (`EscapeResolutionPolicy`):** Evaluiert den kollektiven Team-Erfolg:
  - Richtig-Quote $\rightarrow$ U-Boot Propulsion Speed ($\Delta \text{meters}$)
  - Falsch-Quote $\rightarrow$ Bedrohungsanstieg (Kraken/Druck, max Cap = 1.0)

### 5.3 Persistence Strategy

- Der Zustand aller 3 Modi wird vollständig im bestehenden Snapshot v7 Datenmodell abgebildet ([SDD-FB §4.2](flower-battle-pixi-spine-sdd.md), [SDD-Pyramid §4.3](pyramid-climb-pixi-motion-sdd.md), [SDD-DeepSea §4.2](deep-sea-escape-pixi-motion-sdd.md)).
- Konfigurationen (z. B. aktivierter Modus, Parameter) werden in der bestehenden `games_config`-Tabelle gespeichert (Spalten `experience_modes_enabled`, `flower_battle_target_level`, `flower_battle_powerups_enabled`, `flower_battle_acid_rain_enabled`, `flower_battle_powerup_threshold`; `rust/server/src/db/config.rs`, `db/migrations/024_flower_battle_config.sql`) über bestehende DB-Verbindungen (#960).
- Keine neue Datenbankschicht erforderlich (WP-01 Stack verifiziert ✓).

---

## 6. Program Roadmap

### 6.1 Detail-Arbeitspakete für Blüten-Battle (Phase 1)

1:1 an [SDD-FB §15](flower-battle-pixi-spine-sdd.md) angeglichen (Micro-Work-Packages WP-01..14). **WP-04** ist per [ADR-013-Addendum](flower-battle-pixi-spine-sdd.md) von "Spine-Proof-of-Concept" auf **Puppet-Rig-Proof-of-Concept** korrigiert — die SDD-Kapitelüberschrift selbst wurde nicht textuell umbenannt, nur per Addendum am Dokumentkopf superseded.

| WP ID | Name | Haupt-Deliverable | Gate | Status |
|---|---|---|---|---|
| **WP-01** | Stack & License Gate | ADR-013 v2 & License Audit (`pixi-spine-license-gate.md`) | ADR & Lizenznotiz reviewt, keine offene Versionsunklarheit | ✓ |
| **WP-02** | Canvas Host & Setup | PixiJS Application-Lifecycle, ResizeObserver, Page Visibility, Fehlergrenze & Fallback | 20x Mount/Unmount ohne Listener-/Canvas-/Texture-Leak | In Arbeit |
| **WP-03** | Asset Inventory & Pipeline | Bundle-Manifeste, Ladefortschritt, Lazy Loading, Asset-Unload | Bundle-Ausfall führt zu Fallback statt Match-Abbruch | Offen |
| **WP-04** | Puppet-Rig Proof-of-Concept | Neutrale Testpflanze via prozeduralem Puppet-Rig (PixiJS Container-Hierarchie) + zentralem `MotionPixiAdapter` (kein Spine, ADR-013) | Keine direkten Tween-Aufrufe ausserhalb des AnimationController | Offen |
| **WP-05** | Scene Manager & Layers | `GardenPixiApplication`, Layer-Struktur, responsive Kamera, 2-4 Teambeete, Parallax | Szene mit Dummy-State vollständig testbar | Offen |
| **WP-06** | Domain-Event-Adapter | Übersetzung bestehender Multiplayer-Events in Garden-Events, Versionierung | Contract Tests grün | Offen |
| **WP-07** | Event Queue & Reconciliation | `EventQueue`, Priorisierung, Aggregation, Fast-Forward, Snapshot-Abgleich | 50 simulierte Events führen zum korrekten Endzustand | Offen |
| **WP-08** | Plant Puppet Skeleton | Produktionsfähiges prozedurales Stem/Leaf/Petal-Rig, Skins, Events, Mix-Profil | Asset-Validator meldet fehlende Animationen/Skins/Events | Offen |
| **WP-09** | Growth & Bloom Anims | Wachstumsschübe, Stage-Up, Streak-/Zeitbonus-Reaktion, Overtake-Reaktion | Jede fachliche Ursache hat konsistente visuelle Reaktion | Offen |
| **WP-10** | Power-Up Effects | Effekt-Registry: Sunburst, Water Splash, Shear, Schild | Power-ups verändern keine lokale Fachlogik | Offen |
| **WP-11** | Quality Profiler & Fallback | FPS-Sampling, Auto-Tier-Downgrade, `prefers-reduced-motion`, statischer Fallback | Match bleibt bei absichtlich ausgelöstem Renderfehler spielbar | Offen |
| **WP-12** | Presenter-Integration | Lobby, Rundenstart, aktive Runde, Rundenende, Reconnect, Matchwechsel | Bestehende Modi unverändert, Regressionstests grün | Offen |
| **WP-13** | Mobile Team-Pflanze | Reduzierte Spieler-Ansicht (Low-/Static-Profil) | Time-to-interactive der Antwortseite verschlechtert sich nicht relevant | Offen |
| **WP-14** | Dokumentation & Release | Architektur-, Asset- & Rig-Doku, Lizenzhinweise, Performance-Budgets | `pnpm verify` Clean; neue Reaktion ohne Backend-/Kernszenen-Änderung ergänzbar | Offen |

### 6.2 Program-Wellen für Pyramide & Tiefsee (Phasen 2 & 3)

| WP / W-Phase | Modus | Deliverable / Meilenstein | Abhängigkeit | Gate / Akzeptanzkriterium | Empfohlene Developer-Lane |
|---|---|---|---|---|---|
| **W0** | Pyramid Climb | Design Lock & Wire-Contract Finalisierung | FB Ship (WP-14) | SDD Review Lock | Codex / Grok |
| **W1** | Pyramid Climb | Pyramiden-Puppet-Rigs & Stufen-Assets | Pyramid W0 | Asset Validation & Manifest | Free-Pool / Or-Coder (Scaffolds) |
| **W2** | Pyramid Climb | Presenter & Wire-Events (**Shared-Core Extraktion**) | Pyramid W1 | `team_movement_resolved` Contract-Test | Codex / Grok / Agy |
| **W3..Wn** | Pyramid Climb | Parallax-Climb Refinement & E2E-Suite | Pyramid W2 | Visual Regression & Performance Profile | Sonnet (Review), Agy |
| **W0** | Deep Sea Escape | Design Lock & Wire-Contract Finalisierung | Pyramid W2 Ship | SDD Review Lock | Codex / Grok |
| **W1** | Deep Sea Escape | Submarine/Monster-Rigs & Ozean-Assets | DeepSea W0 | Asset Namespace Check (`dse:*`) | Free-Pool / Or-Coder |
| **W2** | Deep Sea Escape | Presenter & Wire-Events Integration | DeepSea W1 | `escape_round_resolved` Contract-Test | Codex / Grok / Agy |
| **W3..Wm** | Deep Sea Escape | Unterwasser-Shader-Effekte & Polish | DeepSea W2 | E2E Suite & Security Audit | Sonnet (Review), Agy |

### 6.3 Quality & Gate Criteria

1. **Code Integrity:** `pnpm verify` (Clean Build, Linting, Type-Check, Unit Tests).
2. **E2E Automation:** Isoliertes Playwright E2E Testset pro Modus (Happy-Path + Reconnect-Scenario).
3. **Design Token Integrity:** Keine ungemappten Tailwind-Arbitrary-Werte (`pnpm tokens:validate`) — bestehendes Repo-Gate, prüft CSS/Tailwind-Tokens, keine PixiJS-Asset-Namespaces.
4. **Asset-Namespace Integrity:** Zero PixiJS-Asset-Namespace-Kollisionen (`fb:*`, `pyr:*`, `dse:*`) — künftiges dediziertes Gate aus WP-03 (Asset-Namespace-Validator, noch nicht implementiert).
5. **Performance:** Stabil 60 FPS auf Desktop / 30+ FPS Mobile. Auto-Downgrade auf Static Tier bei Frame-Dips.
6. **Security:** Cross-Tab sessionToken Integrität (#959B), keine vertraulichen Daten in PixiJS State-Objects.

---

## 7. Risk Register

| Risiko | Betroffene Modi | Schweregrad | Mitigation Strategy |
|---|---|---|---|
| **Performance-Abfall** durch hohe Partikel- oder Sprite-Anzahl | Alle 3 Modi | Hoch | Dynamic `QualityProfiler`: automatisches Deaktivieren von Partikeln & Effekten, Fallback auf Static Sprite Tier (WP-11). |
| **Reconnect / Network Jitter** während laufender Animation | Alle 3 Modi | Mittel | Monotone `serverRevision`: sofortiges Abbrechen aktiver Tweens & Snap-to-State bei Re-Sync (WP-07). |
| **Canvas Init Failure** (WebGL2 nicht verfügbar / Context Lost) | Alle 3 Modi | Hoch | Canvas Feature-Detection auf Init; nahtloser Fallback auf DOM / Static Sprite Render Tier (WP-02, WP-11). |
| **Motion Library Unzureichend** für komplexe Pfad-Tweens | Alle 3 Modi | Mittel | GSAP Fallback Option explizit gemäss [ADR-013](../adr/013-pixi-spine-hybrid-presenter.md) reserviert. |
| **Asset Name Collisions** zwischen Spielmodi | Pyramide & Tiefsee | Mittel | Verbindliches Namespace Prefixing (`fb:*`, `pyr:*`, `dse:*`), durch CI-Asset-Validator geprüft. |
| **Team-Farben Visual Conflicts** | Pyramide | Mittel | Zentrale Nutzung des `ColorTokenProvider` gemäss Living Design System (keine harten Hex-Farben). |
| **Multi-Mode Regressions** bei Shared-Core Extraktion | Alle 3 Modi | Hoch | Mode-Isolierte E2E Test-Suite wird bei jeder Shared-Core-Modifikation ausgeführt. |
| **Accessibility Violation** (Reduced Motion) | Alle 3 Modi | Mittel | Obligatorische Auswertung von `prefers-reduced-motion`; Deaktivierung aller Kameraschüttel- & Hintergrund-Animationen. |

---

## 8. Anti-Patterns & Anti-Goals

Folgende Ansätze sind im Razzoozle-Presenter streng ausgeschlossen:

- **Kein Spine Runtime Import:** Weder `@esotericsoftware/spine-pixi-v8` noch Rive werden verwendet ([ADR-013](../adr/013-pixi-spine-hybrid-presenter.md)).
- **Keine 3D-Rendering-Engines:** Keine Einführung von Three.js, WebGPU-Meshes oder 3D-Physics-Engines (z. B. Matter.js).
- **Keine neuen WebSocket Top-Level Event Names:** Alle Presenter-Events müssen im `game:experience`-Envelope übertragen werden.
- **Keine Fachlogik im Presenter:** Keine Punkte-, Rang- oder Trefferberechnungen in PixiJS-Komponenten.
- **Keine backend-gesteuerten Animationsbefehle:** Der Server sendet nur fachliche Ergebnisse (z. B. `growth_changed`), keine Befehle wie `play_anim_step_3()`.
- **Keine redundante State-Haltung:** Der Presenter führt keinen parallelen Game State, sondern visualisiert ausschliesslich den serverautoritativen Snapshot v7.

Referenzen: [SDD-FB §17](flower-battle-pixi-spine-sdd.md), [ADR-013 §3](../adr/013-pixi-spine-hybrid-presenter.md), [SDD-Pyramid §16](pyramid-climb-pixi-motion-sdd.md), [SDD-DeepSea §15](deep-sea-escape-pixi-motion-sdd.md).
