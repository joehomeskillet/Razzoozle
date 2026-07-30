# WP-Briefs: Pyramiden-Aufstieg (PixiJS/Motion/Puppet)

**Quelle:** SDD §16, revidiert 2026-07-30  
**Zielfreigabe:** Herbst 2026  
**Rendering:** PixiJS 8 + Motion + Puppet-Rigs  
**Besonderheit:** Shared Puppet-Core wird aus flower-battle extrahiert (WP-03)

---

## Wave 0: Infra & Shared

### WP-01: ADR und Lizenzierung konsumieren
**Lane:** codex · **Effort:** low · **Wave:** 0 · **Abhängig von:** —
**Setup:** git worktree add -b docs/pyramid-adr-research .claude/worktrees/wg0-adr main
**Scope:** ADR-013 PixiJS/Motion/Puppet-Hybrid ist bereits vorhanden. Konsumiere diese + formuliere Pyramid-Climb-spezifische Anpassungen (kein neues ADR, nur Forschungsdocument mit PixiJS-Szenegraph-Anforderungen + Lizenzcheck Kenney CC0).
**Nicht im Scope:** neue ADR, Rive-Integration, GSAP-Standardbundle
**Dateien (≈):** docs/research/pyramid-climb-rendering.md, docs/research/asset-sources/SOURCES.md (+ Pyramid-Einträge)
**Gates (verbatim in Report):** pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Lizenzcheck OK

---

### WP-02: Motion + PixiJS Prototyp
**Lane:** kimi-k3 · **Effort:** medium · **Wave:** 0 · **Abhängig von:** WP-01
**Setup:** git worktree add -b feat/pyramid-motion-proto .claude/worktrees/wg0-motion main
**Scope:** Direktes Animieren von PixiJS Container-Positionen/Skale mit Motion-`animate()`. Kubische Easing, Abort-Signale, AbortController-Cleanup. Reduced-Motion-Flag beachten. Keine Sequenzen, nur Grundbausteine testen.
**Nicht im Scope:** Puppet-Rigs, Szenen, Audio
**Dateien (≈):** packages/web/src/game-rendering/motion/PixiMotionAdapter.ts (~80 LOC), Vitest Suite
**Gates (verbatim in Report):** cd packages/web && vitest run src/game-rendering/motion/
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Motion-Abort + Reduced Motion grün

---

### WP-03: Gemeinsames Puppet-Core aus flower-battle extrahieren
**Lane:** sonnet · **Effort:** high · **Wave:** 0 · **Abhängig von:** WP-02
**Setup:** git worktree add -b feat/pyramid-puppet-core .claude/worktrees/wg0-puppet main
**Scope:** flower-battle hat bereits Puppet-Rig-Infrastruktur. Extrahiere in Shared-Module: Rig Loader (JSON), Pose Mixer, Animation Controller, Face Controller, Asset Validator. Keine Pyramid-Spezifik im Core; Core ist multi-Mode-reusable. Typierung gegen PuppetPartDefinition + TeamClimberRigDefinition (aus SDD).
**Nicht im Scope:** Pyramid-spezifische Posen, Animationen oder Choreographie
**Dateien (≈):** packages/web/src/game-rendering/puppet/core/*.ts (~250 LOC gesamt), Vitest
**Gates (verbatim in Report):** cd packages/web && vitest run src/game-rendering/puppet/core/ && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Rig Loader + Pose Mixer grün

---

### WP-04: CC0-Assetimport (Kenney)
**Lane:** free-pool · **Effort:** low · **Wave:** 0 · **Abhängig von:** WP-01
**Setup:** git worktree add -b feat/pyramid-assets-kenney .claude/worktrees/wg0-assets main
**Scope:** Importiere Kenney Particle Pack, Light Masks, Sketch Desert, Background Elements lokal unter assets/pyramid-climb/. Optimiere Atlanten. Schreibe Assetmanifest.ts. Dokumentiere Quellenangaben (CC0-Links) in SOURCES.md.
**Nicht im Scope:** eigene Assetgenerierung, proprietäre Lizenzen
**Dateien (≈):** assets/pyramid-climb/manifest.ts, SOURCES.md, Atlas-PNGs
**Gates (verbatim in Report):** node scripts/validate-assets.js pyramid-climb
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Atlanten validiert

---

## Wave 1: Szene & Puppet-Basis

### WP-05: PyramidScene Aufbau
**Lane:** kimi-k3 · **Effort:** medium · **Wave:** 1 · **Abhängig von:** WP-02, WP-04
**Setup:** git worktree add -b feat/pyramid-scene .claude/worktrees/wg1-scene main
**Scope:** Erstelle PyramidScene.ts mit Schichtmodell (Background, Temple, Pyramid, Team, Effects, Foreground). Responsive Anchor-Berechnung. Safe Area für DOM-HUD. Viewport-Managmement. Keine Teamlogik, reine Render-Container.
**Nicht im Scope:** Animationen, Logik, Multiplayer
**Dateien (≈):** packages/web/src/features/pyramid-climb/rendering/PyramidScene.ts (~150 LOC), layout-Utilities
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/pyramid-climb/rendering/
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Scene Rendering grün

---

### WP-06: Team-Climber Puppet Prototyp
**Lane:** kimi-k3 · **Effort:** medium · **Wave:** 1 · **Abhängig von:** WP-03, WP-05
**Setup:** git worktree add -b feat/pyramid-climber-puppet .claude/worktrees/wg1-puppet main
**Scope:** Baue TeamClimberPuppet.ts mit mindestens 5 Teilen (Körper, Kopf, zwei Arme, zwei Beine). Implementiere Rig Loader, Idle-Pose, Sprung (+2), Fall (-2), Feiern. Team-Skin (violet/blue/orange/green via Tint). Keine finalen Assets, nur Geometrie.
**Nicht im Scope:** finale Kunstwerke, alle 37 Posen/Sequenzen
**Dateien (≈):** packages/web/src/features/pyramid-climb/puppet/TeamClimberPuppet.ts (~120 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/pyramid-climb/puppet/ && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Prototype grün, visuelle Validierung pending

---

## Wave 2: Backend & Event-Verarbeitung

### WP-07: Mobile Sicherheitswahl UI
**Lane:** kimi-k3 · **Effort:** low · **Wave:** 2 · **Abhängig von:** —
**Setup:** git worktree add -b feat/pyramid-confidence-select .claude/worktrees/wg2-confidence main
**Scope:** DOM-basierte Confidence-Buttons (low/medium/high). Handler nach Mobile-Pattern des Repos. Accessibility (ARIA-Labels). Reconnect-Handling. Doppelabgabe verhindern. Kein PixiJS.
**Nicht im Scope:** visuelle Animation auf Presenter
**Dateien (≈):** packages/mobile/src/experiences/pyramid-climb/ConfidenceSelector.tsx (~80 LOC), Vitest
**Gates (verbatim in Report):** cd packages/mobile && vitest run experiences/pyramid-climb/
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Accessibility + Reconnect grün

---

### WP-08: Backend State & ClimbResolutionPolicy
**Lane:** grok · **Effort:** high · **Wave:** 2 · **Abhängig von:** —
**Setup:** git worktree add -b feat/pyramid-climb-policy .claude/worktrees/wg2-backend main
**Scope:** Rust `ClimbResolutionPolicy`: versionierte `team_movement_resolved`-Events (fromStep, toStep, delta, reason). Serverautoritativ, keine Animationsbegriffe im Event. Nutze game:experience-Envelope + ModeOutcome-Hook #933. Integriere mit bestehender Multiplayer-Aggregation (Punkte, Strike, Zeitbonus).
**Nicht im Scope:** UI-Integration, Websocket-Handler
**Dateien (≈):** rust/server/src/game/modes/pyramid_climb/policy.rs (~200 LOC), tests
**Gates (verbatim in Report):** bash rust/gate.sh && cargo test pyramid_climb
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Policy-Tests grün

---

### WP-09: PyramidEventQueue & StateReconciler
**Lane:** sonnet · **Effort:** medium · **Wave:** 2 · **Abhängig von:** WP-08
**Setup:** git worktree add -b feat/pyramid-event-queue .claude/worktrees/wg2-queue main
**Scope:** PyramidEventQueue.ts (FIFO, Priorisierer für snapshot vs. movement), PyramidStateReconciler.ts (autoritativer Snapshot direkt auf Puppets snappen, laufende Animationen abbrechen). Event-Idempotenz testen.
**Nicht im Scope:** Sequenz-Choreographie
**Dateien (≈):** packages/web/src/features/pyramid-climb/application/PyramidEventQueue.ts (~120 LOC), reconciler (~100 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/pyramid-climb/application/ && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Event-Entkopplung grün

---

## Wave 3: Choreographie & Verfeinerung

### WP-10: Produktions-Teamfiguren & Pivots
**Lane:** kimi-k3 · **Effort:** high · **Wave:** 3 · **Abhängig von:** WP-06
**Setup:** git worktree add -b feat/pyramid-final-puppets .claude/worktrees/wg3-puppets main
**Scope:** Finalisiere 4 Teamfiguren (violet, blue, orange, green) mit allen 37 Posen (neutral, ready, think, confidence_*, anticipate_*, air_*, land_*, slip, fall, overtake, overtaken, near_summit, victory, defeat). Pivot-Validierung. Art Review. Keine Animation, nur Assets.
**Nicht im Scope:** Sequenzen, Bewegung
**Dateien (≈):** assets/pyramid-climb/puppets/*/rig.json, Texturen
**Gates (verbatim in Report):** node scripts/validate-puppet-pivots.js pyramid-climb
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — 4 Figuren validiert

---

### WP-11: Hauptsequenzen (Sprung, Fall, Kampf)
**Lane:** kimi-k3 · **Effort:** high · **Wave:** 3 · **Abhängig von:** WP-10, WP-09
**Setup:** git worktree add -b feat/pyramid-main-sequences .claude/worktrees/wg3-sequences main
**Scope:** Motion-Sequenzen für +1/+2/+3 (jump_up_1 bis _3), -1/-2 (slip_down_*, fall), Overtake, Summit, Reduced-Motion-Fallback. Jede abbrechbar, finale Pose korrekt. Nutze PyramidMovementPlanner.ts.
**Nicht im Scope:** Audio, Effekte, UI-Benachrichtigungen
**Dateien (≈):** packages/web/src/features/pyramid-climb/motion/PyramidMotionSequences.ts (~200 LOC), Timings, tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/pyramid-climb/motion/
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Jump/Fall/Overtake grün

---

### WP-12: Audio + Effekte
**Lane:** free-pool · **Effort:** medium · **Wave:** 3 · **Abhängig von:** WP-11
**Setup:** git worktree add -b feat/pyramid-audio-fx .claude/worktrees/wg3-audio main
**Scope:** Verwende bestehende Audio-Engine. Sound-Marker in Motion-Sequenzen (via Callback, nicht Timeline-Events). Effekt-Pools (Staub, Sterne). Low-Profile Reduktion. Mute-Unterstützung.
**Nicht im Scope:** neue Audio-Engine, Musik-Komposition
**Dateien (≈):** packages/web/src/features/pyramid-climb/audio/PyramidAudioController.ts (~100 LOC)
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/pyramid-climb/audio/
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Audio-Trigger grün

---

### WP-13: Performance, Profile, Fallback
**Lane:** sonnet · **Effort:** high · **Wave:** 3 · **Abhängig von:** WP-11, WP-12
**Setup:** git worktree add -b feat/pyramid-profiles .claude/worktrees/wg3-profiles main
**Scope:** PyramidQualityController (High/Medium/Low/Fallback). Memory-Leak-Tests. Spritesheet-Fallback. Asset-Unload bei `destroy()`. Reduced-Motion degradiert zu statischen Posen + Text-Ergebnisse.
**Nicht im Scope:** Netzwerk-Optimierung
**Dateien (≈):** packages/web/src/features/pyramid-climb/application/PyramidQualityController.ts (~150 LOC), Fallback-Manager (~100 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/pyramid-climb/application/pyramid-quality && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Low Profile + Fallback grün

---

### WP-14: E2E + Telemetrie + Release
**Lane:** sonnet · **Effort:** medium · **Wave:** 3 · **Abhängig von:** WP-13
**Setup:** git worktree add -b feat/pyramid-e2e .claude/worktrees/wg3-e2e main
**Scope:** E2E-Tests (4 Teams, parallele Bewegung, Overtake, Summit). Visual Regression. Telemetrie (scene_init_ms, fps, event_lag). Feature Flag. Doku. Lizenzcheck Kenney → SOURCES.md. Kein Rollback notwendig wenn main staging ist.
**Nicht im Scope:** Prod-Deployment, A/B-Tests
**Dateien (≈):** e2e/pyramid-climb.spec.ts (~150 LOC), telemetry-adapter (~50 LOC), docs/pyramid-climb-tour.md
**Gates (verbatim in Report):** cd e2e && npx playwright test pyramid-climb && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — E2E + Telemetrie grün
