# Flower Battle: Import-Gate-Checkliste (SDD §36)

Dieses Dokument codifiziert den 20-Punkte-Import-Gate aus **SDD §36** als eigenständige, prozessorientierte Checkliste. Jeder Asset-Import-Commit muss alle 20 Punkte durchlaufen und bestanden haben, bevor er in den Hauptbranch gemergt wird.

**Geltungsbereich:** Alle in [flower-battle-asset-inventory.md](./flower-battle-asset-inventory.md) dokumentierten Assets (Abschnitte A, B, C).

---

## Import-Gate-Checkliste (SDD §36)

### A. Lizenzvalidierung & Quellenverifizierung

- [ ] **1. Lizenzverifikation (svgrepo / freesound.org / externe Quellen)**
  - [ ] Jede svgrepo-Eintrag (fertilizer-bag-322313, watering-can-118774) auf der Quelle live verifiziert: ist tatsächlich CC0, nicht CC-BY/CC-BY-SA?
  - [ ] Jede freesound.org-Eintrag live verifiziert: ist CC0 und nicht gelöst?
  - [ ] Wikimedia Commons (weather-reference): CC0 verifiziert?
  - [ ] Kenney-Assets (.nl) ohne explizite Versionsnummer: aktuelle Version korrekt heruntergel​aden?

- [ ] **2. Quellenverzeichnis-Eintrag**
  - [ ] Jedes importierte externe Asset hat einen Eintrag in `packages/web/src/assets/experiences/flower-battle/source/LICENSE-SOURCES.md` (oder parent `packages/web/THIRD_PARTY_LICENSES.md`)
  - [ ] Format: URL + Lizenz + Datum des Abrufs + Commit-SHA des Imports

- [ ] **3. Prioritäts-Gate (SDD §32–§33)**
  - [ ] Vor jeder svgrepo-Übernahme: Ist ein gleichwertiges CC0-Asset vorhanden? (Kenney? wikimedia?)
  - [ ] Keine CC-BY oder CC-BY-SA akzeptiert, wenn CC0-Äquivalent verfügbar ist
  - [ ] Keine Kahoot-Assets, keine KI-generierten Mockups

### B. Geometry & Styling Überprüfung

- [ ] **4. SVG-Struktur & Farb-Token-Anwendung**
  - [ ] Jedes importierte SVG:
    - [ ] Hat eindeutige, sprechende `id`- und `class`-Attribute
    - [ ] Benutzt **currentColor** oder **semantic tokens** statt hardcodierter Hex-Werte
    - [ ] Hat keine willkürlichen RGB-Werte in `<style>`, `<animate>` oder inline-Attributen
  - [ ] Alle Farbtokens sind in `garden-background.catalog.ts` oder äquivalent definiert

- [ ] **5. Particle Anchors & Effekt-Punkte (Gameplay-Assets)**
  - [ ] Jedes Gameplay-Asset (Fertilizer, Umbrella, Weather) hat dokumentierte Named Groups für:
    - [ ] Particle-Entstehungspunkt (z.B. `<g id="particle-origin">`)
    - [ ] Effekt-Ankerpunkt (z.B. `<g id="effect-anchor">`)
  - [ ] ViewBox + Anchor-Koordinaten entsprechen dem Gameplay-Erwartungsrahmen

- [ ] **6. Komplexitäts-Budget & SVGO-Optimierung**
  - [ ] Keine unkomprimierten Pfade; SVGO minimal durchlaufen
  - [ ] Keine redundanten `<defs>`, `<symbol>` oder `<use>` ohne Nutzen
  - [ ] Path-Befehle minimiert, aber Lesbarkeit > 80 Zeichen pro Pfad gewahrt

### C. Background-Recipe Integrations-Gate

- [ ] **7. Seed-Mapping (decorative assets)**
  - [ ] Jedes decorative-background-Asset (Clouds, Horizon, Boundary, etc.) hat ein Seed-ID in `createGardenBackgroundRecipe.ts`
  - [ ] Seed-Auswahl ist deterministisch (keine Math.random())
  - [ ] 100+ verschiedene Seed-Werte produzieren erwartete Variation ohne Wiederholungen

- [ ] **8. Scale & Transform Bounds**
  - [ ] Für seed-selected Assets sind Min/Max-Scale definiert (z.B. Clouds: 0.8–1.5x)
  - [ ] Mirroring (horizontal/vertikal) ist dokumentiert
  - [ ] Begrenzungen entsprechen den `safety_constraints` in der Asset-Inventory

- [ ] **9. Gameplay-Area Ausschluss (Render-Bounds)**
  - [ ] Background-Assets (Foliage, Clouds, Horizon) werden **nie** in der Spielzone platziert:
    - [ ] Nicht über den Team-Betten
    - [ ] Nicht über den Power-up-Items
    - [ ] Nicht über HUD-Elementen (Statusleisten, Labels)
  - [ ] Explizite Render-Bounds in der Recipe (z.B. `x ∈ [0, 8%] ∪ [92%, 100%]` für Edge-Foliage)

- [ ] **10. Versioned Fallback (Recipe-Stabilität)**
  - [ ] `createGardenBackgroundRecipe` hat Versions-konstante (z.B. `RECIPE_VERSION = 1`)
  - [ ] Seed-Hash ändert sich mit `RECIPE_VERSION` → alte Spiele bleibt konsistent
  - [ ] Tests: `testGardenRecipeDeterminism.test.ts` hat ≥100 Seed × 3 Versionen = ≥300 Assertion-Paare

### D. Audio-Integration (falls implementiert)

- [ ] **11. Sounddatei-Format & Länge**
  - [ ] Alle Audio-Kandidaten (.ogg vorbis oder mp3) erfüllen Längenvorgaben:
    - [ ] Granule one-shot: 0.5–0.8s
    - [ ] Sunbeam/Magic: 0.8–1.2s
    - [ ] Acid-rain: 0.8–1.5s
    - [ ] Bloom: variable, max 1.5s
  - [ ] Lautstärke-normalisiert (-14 LUFS oder projektstd), Clipping/Verzerrung geprüft

- [ ] **12. Volume & Mute-Gating**
  - [ ] Audio-Assets respektieren bestehende Razzoozle-Mute-Schalter
  - [ ] Keine Umgehung von Benutzer-Audio-Einstellungen
  - [ ] Nur via GameState-Audio-Manager getriggert, nicht direkt in HTML

### E. Color & Contrast Gate

- [ ] **13. Team-Farb-Kompatibilität**
  - [ ] Alle Gameplay-Assets (Fertilizer, Umbrella, etc.) haben ausreichend Kontrast gegen alle Team-Farben
  - [ ] Dekoration (Clouds, Horizonte) sind nie dominant genug, um Team-Identität zu überlagern
  - [ ] WCAG AA / AAA getestet mind. bei 16px Viewport, 1080p Viewport

- [ ] **14. Paletten-Kontrast & Lesbarkeit**
  - [ ] Jede `garden-sky-palettes-v1`-Palette (Morgen, Mittag, warm, Grau):
    - [ ] Text-Label über Himmel lesbar (min. 4.5:1 Kontrast)
    - [ ] Status-Leisten lesbar
  - [ ] Presenter-Viewport (16:9, mobil 9:16) getestet

- [ ] **15. Keine Night/Dark-Presets**
  - [ ] Nur helle Paletten erlaubt (morning, midday, warm, soft overcast)
  - [ ] Keine dunkelblau, schwarz oder Nacht-Himmel

### F. Performance & Asset-Budget Gate

- [ ] **16. File-Size-Verifizierung (einzelne Assets)**
  - [ ] Kein einzelnes SVG > 50 KB (unkomprimiert)
  - [ ] Kein einzelnes Audio-Asset > 150 KB (je nach Bitrate; meist 64–128 kbps)

- [ ] **17. Gesamt-Package-Unkomprimiert**
  - [ ] Summe aller Flower-Battle-Assets < **500 KB** unkomprimiert
  - [ ] Test: `du -sh packages/web/src/assets/experiences/flower-battle/` muss < 500 KB zeigen

- [ ] **18. Gzip-Transmission-Budget**
  - [ ] Nach gzip mit -9: < **190 KB** (für initial load)
  - [ ] Test: `gzip -9 < file.svg | wc -c` für jeden Asset; Summe < 190 KB
  - [ ] Streaming via HTTP-Compression validiert (browser-test auf echtem Server)

### G. No-Reroll & No-Generation Gate

- [ ] **19. Determinismus & Keine Laufzeit-Generierung**
  - [ ] `createGardenBackgroundRecipe` ist **reine Funktion**: seed + version → exakte Asset-Liste, keine API-Calls, keine fetch(), keine randomRGB
  - [ ] Keine Canvas-/SVG-Image-Generierung im Browser
  - [ ] Keine per-question-Reroll: eine Recipe pro Game, nicht pro Question
  - [ ] Tests: Deterministik-Test mit identischem Seed ≥10× vergebunden (ci/test-garden-recipe-determinism.sh)

- [ ] **20. No-Interaction & Background-Only Constraint**
  - [ ] Decorative Assets sind nie interaktiv:
    - [ ] Keine click-listener
    - [ ] Keine pointer-events
    - [ ] CSS `pointer-events: none;` explizit gesetzt
  - [ ] Powerup-ähnliche Formen (Umbrella, Sunbeam) werden nicht versehentlich als spielbare Items interpretiert
  - [ ] Gameplay-Logik kennt nur kanonische Spielassets (Beds, Plants, Powerups), nie Dekoration

---

## Post-Gate-Actions

### Gate-Bestanden: Merge & Staging-Deploy
- [ ] Alle 20 Punkte erfüllt → Commit auf `feat/flower-battle-asset-inventory-gate` → PR erstellen
- [ ] Code-Review: Minimum 1 +1 (Ideale: Design-Review + FE-Lead)
- [ ] Merge zu Main → automatischer Staging-Deploy (wenn CI grün)
- [ ] Staging-Test: `pnpm test:e2e:flower-battle` / `pnpm test:unit:garden-recipe`
- [ ] Production-Bump: nur nach Staging-Validation

### Gate-Blockiert: Findings dokumentieren
- [ ] Jeder nicht-erfüllte Punkt → GitHub-Issue erstellen (Label: `gate/flower-battle-asset-import`)
- [ ] Issue enthält: Punkt-Nummer, Fehldiagnose, Remediation-Schritt
- [ ] Branchen-Zurückhalt bis Issue geschlossen

---

## Audit-Trail

Für jeden Asset-Importer-Commit ist zu dokumentieren (in PR-Beschreibung oder separater `import-audit.log`):

```markdown
## Import-Audit für <asset-id>

- **Lizenzquelle:** [URL]
- **Abrufdatum:** YYYY-MM-DD
- **CC0-Verifikation:** ✓ oder Details der Abweichung
- **Gate-Punkte bestanden:** 1–20 Häkchen
- **Budget-Prüfung:** <X KB unkomprimiert, <Y KB gzip
- **Seed-Test:** <Z Seeds deterministisch getestet
- **Farb-Token-Review:** [Reviewer Name, Datum]
- **Merge-Genehmiger:** [Name, Datum]
```

---

## Referenzen

- **Asset-Inventory:** [flower-battle-asset-inventory.md](./flower-battle-asset-inventory.md)
- **SDD §36 Volltext:** [Gitea-Umbrella #949](https://gitea.joelduss.xyz/Razzoozle/Razzoozle/issues/949) (externe Quelle)
- **License-Dokumentation:** `packages/web/src/assets/experiences/flower-battle/source/LICENSE-SOURCES.md`
- **Garden-Recipe Test:** `packages/web/src/.../experiences/flower-battle/__tests__/createGardenBackgroundRecipe.test.ts`

---

**Dokumentversion:** WP #934 feat/flower-battle-asset-inventory-gate  
**Nächster Gate-Durchlauf:** vor jedem Asset-Importer-Commit  
**Geltendkraft:** Bindend für alle Flower-Battle-Asset-Importe bis zur SDD-Überprüfung / Versionsnummer-Bump
