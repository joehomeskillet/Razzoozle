# Design-Audit — 2026-07-05

Repo: `/nvmetank1/projects/Razzoozle/source` · Spec: `design.md` · Lenses: glass-blur, hardcoded-color, contrast-fills.
HIGH-Findings adversarial verifiziert. MED-Findings: Room/solo/Burst ebenfalls verifiziert (dabei von HIGH auf MED heruntergestuft); der systemische Raw-Palette-Sweep ist **unverifiziert** (Grep-Heuristik).

---

## 1 · Executive Summary

**Drift-Level: mittel.** Die Token-Schicht und das §6-Glass-Gating sind intakt (siehe §4) — der Drift sitzt fast vollständig in der Komponenten-Schicht: hardcodierte Hex-Werte, Raw-Palette-Klassen und weiße Labels auf Tier-/Akzent-Fills.

Die 3 tragendsten Probleme:

1. **Weiß auf Tier-/Akzent-Fills = unlesbar (§2.5/§3).** `Leaderboard.tsx:202` (Banner, ~1.6–2.2:1 auf Gold/Silber/Diamant), `AchievementBadge.tsx:62` (Diamant-Glyph weiß statt Ink), `solo.tsx:231` / `assignment.$assignmentId.tsx:249` (`text-yellow-500` auf Weiß, 1.9:1). Trifft die fokalen Elemente der Big-Screen- und Finished-Screens.
2. **Hardcodierte Hex umgehen die Runtime-Theme-Engine (§2.2/§3).** `ScoreToast.tsx:37`, `ResultModalStats.tsx:34`, `LowLatencyHealth.tsx:140`, `TrophyGallery.tsx:135` lesen Literale statt `var(--…)` — ein manager-retuntes Theme erreicht diese Komponenten nie.
3. **Systemischer Raw-Palette-Drift (unverifiziert):** ~569 Raw-Palette-Klassen-Treffer in ~40 Komponenten-Dateien, konzentriert in Config-/ResultModal-Flächen (`ConfigSubmissions` 35, `ConfigAI` 30, `ResultModalAnswers` 26, `ConfigMedia` 21, `ResultModalTable` 17, `SubmitPage` 15). Unten sind repräsentative Anker gemeldet, nicht alle 569.

---

## 2 · HIGH-Findings (verifiziert)

Basis-Pfad: `packages/web/src/`

| # | Datei:Zeile | Regel | Evidenz | Fix |
|---|---|---|---|---|
| H1 | `features/game/components/TrophyGallery.tsx:135` | §2.2 kein Hex in Komponenten (+§2.6 dunkle Fläche auf Crème) | `bg-[#2B2B33]` Count-Chip auf der Crème-Trophies-Seite; kein §3-Token. Kombiniert mit `TIER_TEXT` → ~1.1:1 dark-on-dark auf 3 von 4 Tiers | `bg-[var(--surface-muted)]` |
| H2 | `features/game/components/LowLatencyHealth.tsx:140` | §2.2 kein Hex (+§2.6 dunkles In-Flow-Panel, kein Fixed-Scrim) | `bg-[#1B1830] … text-white shadow-xl` Popover auf der crème-konvertierten Manager-Toolbar (mounted via `GameWrapper.tsx:307`) | §3·B Surface-Card-Rezept: `bg-[var(--surface)] text-[var(--game-fg)] border border-[var(--border-hairline)] shadow-[var(--shadow-flat)]` |
| H3 | `features/game/components/ScoreToast.tsx:37` | §2.2 kein Hex; §3 Toast-Rezept liest `--color-accent`/State-Tokens | `const accent = correct ? "#facc15" : "#ef4444"` treibt borderLeft (63), Wash (70), Icons (96/103); `#ef4444` ist das Literal von runtime-themebarem `--state-wrong` | `var(--color-accent)` / `var(--state-wrong)`; Washes via `color-mix(in srgb, var(…), transparent N%)` |
| H4 | `pages/quizz/$id/solo.tsx:231` | §2.2 Raw-Palette + unlesbar (1.9:1, <3:1 Large-Text) | `text-yellow-500` (`#eab308`) auf `bg-white` Score-Card (Z. 228) — fokaler Punktestand des Finished-Screens | `text-[var(--color-primary)]` |
| H5 | `pages/quizz/$id/assignment.$assignmentId.tsx:249` | §2.2 Raw-Palette + unlesbar (Twin von H4) | identische Klasse auf der weißen Score-Card des Assignment-Finished-Screens | wie H4 — Twins synchron fixen |
| H6 | `pages/quizz/$id/assignment.$assignmentId.tsx:133` | §2.6 dunkle In-Flow-Fläche + §2.2 Raw-Palette | `bg-gray-800 … text-white` Punkte-Pill im Shell-Footer (in-flow auf `bg-white`-Bar, Crème-Shell); umgeht runtime-themebares `--surface-muted` | `bg-[var(--surface-muted)]` (Twin `solo.tsx:115` mitfixen, siehe M2) |
| H7 | `features/manager/components/ResultModal/ResultModalStats.tsx:34` | §2.2 kein Hex; §3 `--state-correct` ist RUNTIME-themebar | `stroke="#22c55e"` auf dem Correct-Donut — Literal des Tokens; retuntes State-Color erreicht den Chart nie | `style={{ stroke: "var(--state-correct)" }}` (Presentation-Attrs lösen `var()` nicht auf) |
| H8 | `features/game/achievements/AchievementBadge.tsx:62` | §2.5+§3 Tiers: nie Weiß auf Diamant (+§2.2 Hex) | `LIVE_GLYPH_HEX.diamant = "#ffffff"`, als Inline-Style (Z. 165) — überschreibt das spec-konforme `TIER_TEXT.diamant`; Weiß auf Diamant-Gradient ≈1.8–3.4:1 | `diamant: "#0E1120"` oder Inline-`iconStyle` im Live-Mode droppen und `TIER_TEXT[tier]` wirken lassen |
| H9 | `features/game/components/states/Leaderboard.tsx:202` | §2.5+§3 Tiers: nie Weiß auf Gold/Silber/Diamant (Manager-Screen ist crème, §1) | CelebratoryBanner: unbedingtes `text-white` auf `TIER_GRADIENT_VAR[tier]` — Gold ≈1.6:1, Silber ≈1.9:1, Diamant ≈2.2:1; Gold/Diamant-Banner treten routinemäßig auf | Tier-konditional: `text-[var(--answer-text)]` für Silber/Gold/Diamant, `text-white` nur Bronze (Muster: `TIER_TEXT`-Map in `achievements.ts`) |

---

## 3 · MED-Findings (nach Lens)

### Lens: glass-blur / dark-surface

- **M1 · `features/game/components/states/Room.tsx:166`** — *(verifiziert, HIGH→MED)* `rounded-md bg-black/80 p-2` Hover-Pill (Maximize2) absolute-inset-0 **im** in-flow weißen QR-Tile (Z. 159) auf der Crème-Lobby; Fixed-Scrim-Carve-out greift nicht (der sitzt separat auf Z. 174). Herabgestuft, weil default `opacity-0` und nur bei group-hover sichtbar. Fix: Flat-Surface-Rezept `bg-[var(--surface)] border border-[var(--border-hairline)] shadow-[var(--shadow-flat)]` + `text-[var(--game-fg)]`.

### Lens: hardcoded-color

- **M2 · `pages/quizz/$id/solo.tsx:115`** — *(verifiziert, HIGH→MED)* `bg-gray-800 … text-white` Punkte-Pill in-flow auf der `bg-white`-Footer-Bar der Crème-Solo-Shell. Twin von H6; identischer Drift zusätzlich in `GameWrapper.tsx:475` (Port-Origin). Kontrast selbst ok (~12:1) — Defekt ist Token-Binding/Themeability. Fix: `bg-[var(--surface-muted)]` (korrektes Muster: `Prepared.tsx:35`).
- **M3 · `features/game/celebration/AchievementBurst.tsx:96`** — *(verifiziert, HIGH→MED; beide Lenses hardcoded-color + contrast-fills)* `style={{ color: '#ffffff' }}` auf jedem Tier-Disc-Glyph — Weiß auf Silber-/Gold-Gradient ~1.5–2.4:1; eigene `TIER_TEXT`-Map und `LIVE_GLYPH_HEX`-Muster ignoriert. Herabgestuft, weil aktuell Dead Code (CelebrationOverlay hat null Consumers). Fix: `className={TIER_TEXT[tier]}` bzw. Ink für Silber/Gold/Diamant.

### Lens: hardcoded-color, systemisch — **unverifiziert**

- **M4 · Raw-Palette-Sweep:** ~569 Raw-Palette-Klassen-Treffer in ~40 shipped Komponenten-Dateien, wo §3-Tokens existieren. Top-Offender: `ConfigSubmissions` (35), `ConfigAI` (30), `ResultModalAnswers` (26), `ConfigMedia` (21), `ResultModalTable` (17), `SubmitPage` (15). Grep-Heuristik ohne Einzelprüfung — vor dem Fix pro Datei gegen die §2.6-/Token-Definition-Carve-outs prüfen.

Keine LOW-Findings gemeldet.

---

## 4 · Saubere Bereiche (nennenswert)

- **§2.1 null Live-Treffer:** kein `backdrop-blur` / `backdrop-filter` / inline `backdropFilter` / `@supports backdrop` in irgendeiner Komponente/Page unter `packages/web/src` — einzige Vorkommen: `index.css:469-530`, alle im §6-sanktionierten Gated-Block.
- **§6 Gating strukturell verifiziert:** jede backdrop-filter-Regel, der `@supports`-not-Fallback (515-520) und der prefers-reduced-transparency-Fallback (524-533) sind unter `[data-theme-style="glass"]` gescoped; nichts leakt in `:root`/flat.
- **§6 Gate hart erzwungen:** `features/theme/apply.ts:66` setzt `data-theme-style="flat"` bei jedem Apply — persistiertes `style:"glass"` kann nie aktiv werden; kein anderer Code schreibt das Attribut.
- **Keine `.glass*`-Klasse** in irgendeinem Komponenten-className; Glass-Referenzen außerhalb `index.css` sind nur Kommentare.
- **§2.6 Carve-out korrekt genutzt:** alle Radix-/Modal-Scrims sind `fixed inset-0` full-screen (AlertDialog:37, GameWrapper:336, Room:174/278, party/manager/$gameId:159, ResultModal/index:34, ConfigMedia:94, QuizzEditorHeader:321, CreateAssignmentModal:155, ConfigCatalog:292, MediaPickerModal:97, CatalogPickerModal:114) — sanktioniert.
- **§2.7 Scrim inert:** `--bg-scrim: 0` (index.css:20), Runtime-Defaults 0, kein Live-UI-Consumer — nur Manager-Theme-Preview-Simulation; `Background.tsx` trägt keinen Scrim-Layer.
- **Token-Definitionen sauber:** `index.css` `:root/@theme` + `console/tokens.css` (Console via `color-mix` von `--color-primary` abgeleitet, bis auf dokumentiertes `.console-shell`-Pinning).
- **Sanktionierte Ausnahmen intakt:** `TrophySticker.tsx` (dokumentierte foreignObject-Capture-Ausnahme, `docs/design/trophy-sticker.md` §4), `AchievementBadge` colorOverride-Pfad, Shell-Level `--game-fg`-Literale (GameWrapper:154, solo:67, assignment:88 — §2.4/§3-Mandat).
- **Answer-Pipeline voll token-bound:** `AnswerButton.tsx` (Hairline-Ring §2.3 auf jedem Tile, Reveal mit State-Fill + Ink-Text), `utils/answers.ts` (uniform Ink-Label), `SoloAnswers.tsx` (Reveal in-place, colorIndex/ShapeIcons), `Result.tsx:197` (exakt §3-Reveal-Rezept).
- **`states/Podium.tsx`** Medal-Farben spec-konform (Gold/Silber → Ink, Bronze → Weiß); Weiß-auf-Akzent-Punkte = akzeptierte STAGE-Konvention (§7). **`utils/teams.ts`** voll token-bound. **RewardRow/ScoreToast-Card-Shells** matchen das §3-Toast-Rezept (nur ScoreToasts Akzent-WERT ist H3).
- **Hex nur in Kommentaren:** `ConfigSkeleton.tsx:360`, `ColorPickerField.tsx:12`, `theme/apply.ts:42`, `console/contrast.ts:16`.

---

## 5 · Fix-Work-Packages (file-disjoint)

| WP | Scope (Dateien) | Findings | Aufwand | Lane |
|---|---|---|---|---|
| **WP-A** Twin-Shells | `pages/quizz/$id/solo.tsx` (115, 231), `pages/quizz/$id/assignment.$assignmentId.tsx` (133, 249), `features/game/components/GameWrapper.tsx` (475) | H4, H5, H6, M2 | S | `@or-coder-free` — mechanische Klassen-Swaps (`text-yellow-500`→`text-[var(--color-primary)]`, `bg-gray-800`→`bg-[var(--surface-muted)]`), Twins synchron halten |
| **WP-B** Tier-Kontrast | `features/game/components/states/Leaderboard.tsx` (202), `features/game/achievements/AchievementBadge.tsx` (62/165), `features/game/celebration/AchievementBurst.tsx` (96), `features/game/components/TrophyGallery.tsx` (135) | H1, H8, H9, M3 | M | `@css-bugfixer` — tier-konditionale Farb-Logik gegen `TIER_TEXT`-Map, Kontrast nach Fix gegen §3-Tier-Tabelle prüfen |
| **WP-C** Token-Binding | `features/game/components/ScoreToast.tsx` (37/63/70/96/103), `features/manager/components/ResultModal/ResultModalStats.tsx` (34), `features/game/components/LowLatencyHealth.tsx` (140), `features/game/components/states/Room.tsx` (166) | H2, H3, H7, M1 | M | `@css-bugfixer` — `var(--…)` + `color-mix`-Washes; SVG-stroke via `style`, Popover/Pill aufs §3·B-Surface-Rezept |
| **WP-D** Raw-Palette-Sweep (Backlog) | `ConfigSubmissions`, `ConfigAI`, `ResultModalAnswers`, `ConfigMedia`, `ResultModalTable`, `SubmitPage` (Top-6 von ~40) | M4 (unverifiziert) | M | `@or-coder-free`-Pool, Last verteilen — pro Datei erst Carve-outs prüfen, dann Token-Mapping; danach Rest-Sweep als Folge-WP entscheiden |

Reihenfolge: WP-A (billig, sichtbar) → WP-B (Lesbarkeit Big-Screen) → WP-C (Themeability) → WP-D (Backlog). WPs sind file-disjoint und parallel dispatchbar. Gate nach jedem WP: Grep-Protokoll aus `design.md` (Z. 211) + Sichtprüfung der Finished-/Leaderboard-Screens.

---

## Gegenprüfung (2026-07-05, grok-build + cursor-gpt5, unabhängig)

- **9/9 HIGH von beiden Reviewern unabhängig BESTÄTIGT, 0 False-Positives.**
- **Übersehenes HIGH (Grok):** `features/game/components/states/Prepared.tsx:47` — `text-white` überschrieb das korrekte `--answer-text` auf den Answer-Tiles (§2.5). **Gefixt in diesem Commit** (`text-[var(--answer-text)]`), Gate grün (types + 142/142 Web-Tests).
- **M4-Heuristik entwertet (Cursor):** Stichprobe der ~569 Raw-Palette-Treffer → **~65% False-Positive-Quote** (Error-Icons, Chrome-UI außerhalb Design-System). WP-D nur mit Carve-Out-Pre-Check pro Datei dispatchen.
- Trust-Scores: Cursor 72/100, Grok 7.5/10. WP-Schnitt A/B/C als file-disjunkt + korrekt dimensioniert bestätigt.
- Anmerkung Grok (semantic debt, kein Renderbug): `GameWrapper:473` text-white auf weißem Footer-Wrapper.
