# Flower Battle: Third-Party License Sources

Dieses Dokument katalogisiert alle Drittquellen-Assets (externe Downloads, CC0-Material, Shape-Referenzen) für die Blüten-Battle-Erweiterung. Es ist eine **Ergänzung** zu `../../../../../../THIRD_PARTY_LICENSES.md` und enthält nur Flower-Battle-spezifische Einträge.

**Format-Referenz:** Siehe `packages/web/THIRD_PARTY_LICENSES.md` (Haupt-Projekt-Lizenz-Datei); dieses Dokument folgt der gleichen Struktur.

---

## Struktur

Jeder Eintrag folgt diesem Format:

```markdown
### <Asset-Name> (<asset-id>)

**Quelle:** <URL>  
**Lizenz:** <CC0 / CC-BY / CC-BY-SA / MIT / etc.>  
**Abrufdatum:** YYYY-MM-DD  
**Commit-SHA:** <wenn importiert>  
**Verwendung:** <Beschreibung>  
**Status:** [Imported | Reference-only | Not Imported for MVP]  
**Farb-Token-Review:** [Reviewer, Datum] oder [Ausstehend]  

#### Erforderliche Änderungen
- <Transformation 1>
- <Transformation 2>

#### Notizen
- <Kontext oder Alternativen>
```

---

## Externe Quellen & CC0 Raw-Material

Diese Einträge sind als **Vorlagen** zu sehen, die vor dem Commit mit echten Import-Daten gefüllt werden.

### Kenney Foliage Pack (`kenney-foliage-pack`)

**Quelle:** https://www.kenney.nl/assets/foliage-pack  
**Lizenz:** CC0  
**Abrufdatum:** [TBD — bei Import erfassen]  
**Commit-SHA:** [TBD]  
**Verwendung:** Decorative background vegetation (bushes, grass, distant trees)  
**Status:** [Imported | Pending | Reference-only]  
**Farb-Token-Review:** [Ausstehend]  

#### Erforderliche Änderungen
- Extract selected vectors only (no complete pack import)
- Remove fixed colors; replace with semantic tokens (--accent-tint, --flower-foliage-primary, etc.)
- Optimize SVG paths with SVGO
- Define stable asset IDs and selection criteria for background recipe

#### Notizen
- Kenney assets sind hochwertig; keine alternativen Quellen erforderlich
- Farb-Anpassung mandatory vor Production-Integration

---

### Kenney Foliage Sprites (`kenney-foliage-sprites`)

**Quelle:** https://www.kenney.nl/assets/foliage-sprites  
**Lizenz:** CC0  
**Abrufdatum:** [TBD]  
**Commit-SHA:** [TBD]  
**Verwendung:** Leaf silhouettes, edge vegetation  
**Status:** [Imported | Pending | Reference-only]  
**Farb-Token-Review:** [Ausstehend]  

#### Erforderliche Änderungen
- Use flat variants only (no 3D or isometric sprites)
- Simplify paths for web rendering
- Apply semantic tokens for colors
- Optimize for reduced-motion mode

#### Notizen
- Sprites-Pack ist grösser; selective curation essential

---

### 44pes Grass Tileset (`44pes-grass-tileset`)

**Quelle:** https://44pes.itch.io/platformer-grass-tileset  
**Lizenz:** CC0  
**Abrufdatum:** [TBD]  
**Commit-SHA:** [TBD]  
**Verwendung:** Reference for lawn and soil edge shapes  
**Status:** [Reference-only | Selected SVGs pending import]  
**Farb-Token-Review:** [Ausstehend]  

#### Erforderliche Änderungen
- Do NOT import complete tileset
- Select individual SVG shapes after style review
- Adapt to Razzoozle garden aesthetic
- Ensure compatibility with team-bed geometry

#### Notizen
- Tileset ist platformer-specific; Blüten-Battle hat anderes Kompositions-Paradigma
- Use only as geometric reference, nicht als direkte Übernahme

---

## Shape-Referenzen & Geometrie-Vorlagen

Diese sind **Referenzen nur**, keine direkten Importe:

### Umbrella Shape Reference (`umbrella-reference-311232`)

**Quelle:** https://svgsilh.com/ffff00/image/311232.html  
**Lizenz:** CC0  
**Abrufdatum:** [TBD, falls konsultiert]  
**Commit-SHA:** [N/A — nicht importiert]  
**Verwendung:** Geometric inspiration for umbrella power-up canopy and handle groups  
**Status:** Reference-only — eigenes SVG gebaut  
**Farb-Token-Review:** N/A  

#### Notizen
- Decision: Prefer own simple SVG (nicht direkte Übernahme)
- Razzoozle-Umbrella wird mit benannten Gruppen für Animationen aufgebaut
- svgsilh-Quelle war bloss Formenvorlage

---

### Weather Shape Reference (`weather-reference`)

**Quelle:** https://commons.wikimedia.org/wiki/File:Weather_icon_-_sun_rain.svg  
**Lizenz:** CC0  
**Abrufdatum:** [TBD, falls konsultiert]  
**Commit-SHA:** [N/A — nicht importiert]  
**Verwendung:** Geometric reference for sun, cloud, and rain droplet shapes  
**Status:** Reference-only — separate canonical Razzoozle assets gebaut  
**Farb-Token-Review:** N/A  

#### Notizen
- Decision: Build separate own sun, cloud, and droplets (keine Wikimedia-Übernahme)
- Ermöglicht volle Kontrolle über Animationen und Token-Integration

---

## Fallback-Only Icons

### Nieobie Icon Pack (`nieobie-game-icons`)

**Quelle:** https://nieobie.itch.io/free-icons  
**Lizenz:** CC0  
**Abrufdatum:** [TBD, nur bei Bedarf]  
**Commit-SHA:** [TBD, falls einzelne Icons importiert]  
**Verwendung:** Fallback UI icons only if Lucide lacks neutral equivalent  
**Status:** Fallback-only — kein Massen-Import  
**Farb-Token-Review:** [Per Import-Instanz]  

#### Erforderliche Änderungen
- Verify no existing Lucide or Razzoozle equivalent first
- Import only exact single SVG files (never the whole pack)
- Apply semantic tokens for colors
- Maintain consistency with existing Razzoozle icon style

#### Notizen
- Nieobie ist gutes Fallback-Set, aber Lucide ist Primär-Quelle
- Nur bei explizitem Design-Fehler fallback-Aktion

---

## CC0-Lizenzverifizierung (svgrepo)

### Fertilizer Bag Icon (`fertilizer-bag-322313`)

**Quelle:** https://www.svgrepo.com/svg/322313/fertilizer-bag  
**Lizenz:** CC0 per source page (zu verifizieren)  
**Abrufdatum:** [TBD — bei Import]  
**Commit-SHA:** [TBD]  
**Verwendung:** Base geometry for fertilizer power-up  
**Status:** [Imported | Pending Redraw | Queued]  
**Farb-Token-Review:** [Ausstehend]  

#### Erforderliche Änderungen
- Redraw/simplify into Razzoozle style
- Replace mark with Razzoozle font-icon or vector
- Apply semantic tokens (currentColor/--flower-powerup-primary)
- Define particle-origin and effect-anchor named groups

#### Verifikations-Checkliste
- [ ] svgrepo source page verifizieren: CC0 (nicht CC-BY/CC-BY-SA)?
- [ ] Abrufdatum dokumentieren
- [ ] Lizenz-String speichern (für THIRD_PARTY_LICENSES.md)

#### Notizen
- Svgrepo hat gute Qualität; CC0-Verifikation ist der kritischste Schritt

---

### Watering-Can Icon (`watering-can-118774`)

**Quelle:** https://www.svgrepo.com/svg/118774/garden-watering-can  
**Lizenz:** CC0 per source page (zu verifizieren)  
**Abrufdatum:** [N/A — nicht in MVP]  
**Commit-SHA:** [N/A]  
**Verwendung:** [Reserve für zukünftige watering-can power-up]  
**Status:** Not imported for MVP  
**Farb-Token-Review:** N/A  

#### Notizen
- Ist explizit aus dem MVP ausgeschlossen
- Wird erst verifiziert, wenn die Watering-Can-Feature genehmigt ist (SDD-Nachlass)

---

## Audio Assets (Kandidaten)

### Fertilizer Granule One-Shot (`fertilizer-sfx-seeds-235278`)

**Quelle:** https://freesound.org/people/Godowan/sounds/235278/  
**Lizenz:** CC0  
**Abrufdatum:** [TBD, nur bei Import]  
**Commit-SHA:** [TBD]  
**Dateiname:** `public/sounds/flower-battle/fertilizer.ogg`  
**Verwendung:** Feedback sound when fertilizer power-up collected  
**Status:** Candidate — nur wenn Razzoozle sound library kein Äquivalent hat  
**Verifikation:** [Ausstehend]  

#### Erforderliche Änderungen
- Trim to 0.5–0.8s
- Reduce glass resonance (EQ)
- Normalize to -14 LUFS
- Encode to OGG Vorbis 64 kbps (oder Projekt-Standard)

---

### Sunbeam / Growth Magic (`sunbeam-sfx-817466`)

**Quelle:** https://freesound.org/people/qubodup/sounds/817466/  
**Lizenz:** CC0  
**Abrufdatum:** [TBD, nur bei Import]  
**Commit-SHA:** [TBD]  
**Dateiname:** `public/sounds/flower-battle/sunbeam.ogg`  
**Verwendung:** Sunbeam / growth magic effect feedback  
**Status:** Candidate  
**Verifikation:** [Ausstehend]  

#### Erforderliche Änderungen
- Trim to 0.8–1.2s
- Loudness limit: -14 LUFS
- Encode to OGG Vorbis

---

### Acid Rain Effect (`acid-rain-sfx-789160`)

**Quelle:** https://freesound.org/people/FOSSarts/sounds/789160/  
**Lizenz:** CC0  
**Abrufdatum:** [TBD, nur bei Import]  
**Commit-SHA:** [TBD]  
**Dateiname:** `public/sounds/flower-battle/acid-rain.ogg`  
**Verwendung:** Acid-rain weather effect  
**Status:** Candidate  
**Verifikation:** [Ausstehend]  

#### Erforderliche Änderungen
- Extract 0.8–1.5s segment
- No looping
- EQ if needed to reduce harshness
- Normalize and encode to OGG Vorbis

---

### Bloom Sparkle (`bloom-sfx-578803`)

**Quelle:** https://freesound.org/people/nomiqbomi/sounds/578803/  
**Lizenz:** CC0  
**Abrufdatum:** [TBD, nur bei Import]  
**Commit-SHA:** [TBD]  
**Dateiname:** `public/sounds/flower-battle/bloom.ogg`  
**Verwendung:** Final bloom sparkle feedback  
**Status:** Candidate — prefer existing Razzoozle chime  
**Verifikation:** [Ausstehend]  

#### Notizen
- Check existing Razzoozle chime library first
- Nur wenn kein äquivalenter Ton vorhanden

---

## Ergänzungs-Leitfaden

**Bei jedem neuen Asset-Import:**

1. CSV-Zeile aus [flower-battle-asset-inventory.md](../flower-battle-asset-inventory.md) in dieses Dokument kopieren
2. Alle `[TBD]`-Platzhalter mit echten Werten füllen
3. `Abrufdatum` im Format `YYYY-MM-DD` erfassen (Importtag)
4. Nach Import: `Commit-SHA` nachtragen (aus `git log --oneline`)
5. `Farb-Token-Review` durchlaufen (Design-Review erforderlich)
6. Diesen Datei-Eintrag in `packages/web/THIRD_PARTY_LICENSES.md` auch eintragen (bei Bedarf verkürzt)

**Versionskontrolle:** Dieses Dokument wird mit jedem Asset-Importer-Commit aktualisiert.

---

## Verwandte Dokumente

- **Asset-Inventory & Kategorisierung:** `docs/design/flower-battle-asset-inventory.md`
- **Import-Gate-Checkliste (SDD §36):** `docs/design/flower-battle-import-gate-checklist.md`
- **Projekt-Haupt-Lizenz-Datei:** `packages/web/THIRD_PARTY_LICENSES.md`
- **Design-Tokens Referenz:** `design.md` (Projekt-Root)

---

**Dokumentversion:** WP #934 feat/flower-battle-asset-inventory-gate  
**Zuletzt aktualisiert:** 2026-07-30 (Skeleton-Erstellung; keine echten Importe noch)  
**Nächste Aktion:** Bei Asset-Importer-Commit alle `[TBD]`-Felder mit echten Werten füllen
