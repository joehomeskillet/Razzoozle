# Manager-UI/UX W0–W6 — Kickoff für frische Session (abgeglichen 2026-07-16)

**Deployed == main == `b334e6f0`**, healthz 200. Dieser Abgleich prüft den User-Befehl gegen SDD + echten Repo-Stand. Vor Start lesen: `docs/design/manager-uiux-sdd.md` (§5 D1–D18, §6 Fahrplan, §7 Nicht-Ziele) + `design.md` + die 10 Checklisten in `scratchpad/manager-uiux-review/checklists/`.

## Grundlagen-Check (alle ✅ vorhanden)
- `docs/design/manager-uiux-sdd.md` (18 KB) · Volltext-Backup Gitea #86.
- `scratchpad/manager-uiux-review/checklists/` — 10 Dateien, Summe **exakt 384 Funde** (console-shell 82 · ai-dev-toplevel-game 112 · media 41 · klassen 32 · submissions-achievements 26 · theme 26 · labels 23 · schueler 20 · catalog 14 · quizzes 8). NICHT löschen.
- `scratchpad/manager-uiux-review/*.png` — 35 Baseline-Screenshots (W6-Abgleich). NICHT löschen.
- `packages/web/src/features/manager/components/console/tokens.css` (1.9 KB) · `design.md` (244 Z.).
- `scripts/check-manager-tokens.sh` — **fehlt korrekt** (ist W0-3-Deliverable). Ohne dieses Gate kein W1.

## Reihenfolge (SDD §6, deckungsgleich mit Befehl)
`W0 (sequenziell) → {W1 ∥ W4} → {W2 ∥ W3 ∥ W5} → W6`. ~30 WPs. Innerhalb jeder Welle Fan-out ≥3 in EINER Message, session-keeper für die CLI-Flut.

## Worker-Direktive (User-Override, ersetzt SDD-Lane-Guidance)
- **grok + codex 50/50** über ALLE Wellen (SDD wollte free-pool für mechanisches W1 — der User-Befehl überschreibt auf reine CLI-Lanes). Konsequenz: ~30 WPs auf 2 Subscription-Lanes → mehr Quota/Zeit; `claude-quota-healthmap` vor jeder Welle, session-keeper Pflicht.
- **Per-WP Cross-Vendor-Review** (jeder grok-WP → codex, jeder codex-WP → grok; Reviewer ≠ Implementer, Reviewer fixt NIE selbst, Findings zurück an Autor). Das ist STRENGER als der SDD-Vorschlag „per-Welle grok Wave-Review" und ersetzt ihn.
- Reviewer prüft auch die **won't-fix-1-Zeilen-Begründungen** der Checklisten-Items.
- **Eskalation bei 2× Fehlschlag:** sonnet-worker (isolation:worktree) → dann Fable-Subagent.
- **W3-2 Drawer-Nav** direkt an sonnet-worker (UI-kritisch); Review trotzdem cross-vendor.

## ⚠️ Kritische Wechselwirkung mit heutiger #85-Arbeit (MUSS in W4)
Heute deployed (WP-A6, `cf1019d8`): der Eviction-Reaper überspringt stale Games, solange der **Manager-Socket lebt**. Folge für **W4-2 (F2 Podium-Exit-Zombie):** ein Manager, der auf dem Podium-Screen sitzt, hält seinen Socket → das Spiel wird vom Reaper NICHT mehr aufgeräumt. Der „Zombie Running·Host offline" verschwindet also NICHT mehr von selbst. **W4-2 MUSS ein explizites serverseitiges Game-End bei Podium-Exit / Host-FINISHED setzen** (nicht auf den Reaper hoffen). Referenz: `rust/server/src/state/eviction.rs` + `cleanup_empty_games` (empty-grace greift nur bei Manager-DISCONNECT). Analyse-WP W4-1a zuerst (Client-Route vs. Rust-Session, Memory `silent-unauthorized-is-game-host`).

## Offene Punkte / Deps zum Flag
- **W1+ Gate hängt an W0-3:** `check-manager-tokens.sh` muss grün landen, bevor W1-Gates laufen. W0 ist hart sequenziell.
- **#89 (Stagehand-Harness-Socket-Drop)** blockt die Manager-Stagehand-Suite (W3/W6) VORAUSSICHTLICH NICHT — #89 bit nur Specs mit einem still im Warteraum sitzenden Spieler; Manager-Nav-Smokes sind Single-Actor. Trotzdem bei W6 im Auge behalten.
- **Konvergente-Halluzination-Regel (SDD §3, Memory `convergent-hallucination-deterministic-check`):** Tailwind v4 generiert `@theme`-Utilities (`bg-primary`, `focus-visible:outline-primary` EXISTIEREN in der kompilierten CSS). Multi-Lane-Findings VOR Übernahme deterministisch gegen `dist/assets/*.css` greppen. D2 migriert `bg-primary`→var-Syntax als Konsistenz, NICHT als Bugfix.
- **Nicht-Ziele (SDD §7):** Cream-Spielbühne NICHT anfassen, keine neuen Dependencies (Radix ist da), keine neue IA über D12-Gruppierung hinaus, Editor nur Token/Focus-Hygiene.

## Wave-Gate (nach JEDER Welle, dann deploy + voller Game-Loop-Browsertest)
`CI=true pnpm --filter @razzoozle/web run types` (GENAU 2 bekannte Fehler) · `design-validator` · `scripts/check-manager-tokens.sh` (nach W0-3) · Screenshot-Abgleich gegen Baseline (nur beabsichtigte Diffs) · stagehand-Smokes · check-locales.sh wenn Locale berührt. Full-Loop: login→create→START→play→reveal→finish→podium (Lobby reicht NICHT).

## Abschluss (W6)
Vorher/Nachher-Screenshots · Issue #86 schließen · beide Remotes pushen · design-sync Re-Sync (`.design-sync/NOTES.md`, 1 Kommando) · Memory + Checkpoint.

## Split-Check-Vorlage je Welle
Jedes WP explizit: 1 Datei? ≤150 LOC? Checkliste des Bereichs im Prompt? Welle ≥3 Worker? wp-issue in Gitea agent-claude/Razzoozle angelegt? — Ergebnis im Dispatch-Reply ausweisen.
