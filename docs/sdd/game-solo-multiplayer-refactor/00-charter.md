# 00 — Charter: Game Solo/Multiplayer Refactor + Klassenmodus-Join

**Status:** active · **Owner (adjudicator):** Claude (orchestrator) · **Started:** 2026-07-18

## Mandat

Ein zusammenhängendes SDD-Programm über drei Stränge plus eine fehlende Kernfunktion:

1. **UI/UX-Audit + Verbesserung** — Solo, Multiplayer, Host/Presenter, Player, Lobby, Join, Gameplay, Feedback, Resultate, Reconnect/Fehler.
2. **Modularisierung** — Domain, State, Events, Components, Hooks, Services; gemeinsame Primitives/Patterns; Duplikations-Abbau Solo↔Multiplayer.
3. **Visuelle Vereinheitlichung** — gleichartige Elemente tatsächlich identisch (Geometrie, nicht nur Klassennamen), Cream-Design als einzige Grundlage.
4. **Klassenmodus-Beitritt (neu):** Host-Switch vor Spielstart → Beitritt per Spielcode → Namensauswahl aus der Klasse → Emoji-PIN → **serverseitige** Verifikation; freie Namenseingabe darf den Modus nicht umgehen.

Bei Überschneidung gilt die strengere Anforderung.

## Methode

Specification-Driven. **Grok** (grok-build) = primärer UX/Visual/A11y-Audit. **Codex** (codex-gpt5) = primärer Architektur-/Sicherheits-/Duplikations-Audit. Beide führen Cross-Review. **Claude** adjudiziert Konflikte (Adjudication Matrix), legt Zielarchitektur, Sicherheitsgrenzen und visuelle Zielregeln fest, friert die SDD ein und implementiert über Worker (kein Produkt-Code vom Orchestrator).

Reihenfolge: Phase-0-Inventar + Baseline → Grok/Codex-Primärreviews → Cross-Review → Adjudication/Freeze → Implementierung in Wellen (Klassenmodus → Modularisierung → Migration Solo/MP/Lobby/Reconnect → visuelle Konsistenz → Cleanup) → Tests → Endreview → Reports. Kein Big-Bang; jede Welle einzeln testbar/reviewbar/rücksetzbar.

## Reuse-Scan (verbindlich — Anti-Neuerfindung)

- **Backend = nur Rust** (`rust/{engine,protocol,server}`). Node-Twin gelöscht. Client = `packages/web` (React/TS, TanStack Router). Shared = `packages/common`.
- **Emoji-PIN + Klassen/Schüler-Datenmodell existiert bereits** — `rust/server/src/http/emoji_pin.rs`, `db/pins.rs`, `http/assignments.rs`, `db/classes.rs`, `socket/manager/classes.rs`, Validator `packages/common/src/validators/assignment.ts`, Primitive `packages/web/src/components/PinInput.tsx`. **PIN-Speicherung wird wiederverwendet, nicht neu gebaut** (nur bei technisch zwingender, SDD-begründeter Notwendigkeit ändern).
- Spielcode = Raum-**PIN** (Kahoot-Stil), zusätzlich `inviteCode` für Rejoin.
- `design.md` §3·B trägt bereits eine Component Inventory + Validator-Gate (`~/.claude/skills/design-validator`).
- Präzedenz-SDD `docs/sdd/manager-ui-ux-refactor/` liefert die 00–22-Struktur → gespiegelt.
- Grounding-Docs wiederverwenden statt neu ableiten: `docs/rust-port-event-inventory.md` (Events), `docs/KAHOOT-GAP-ANALYSIS-v2.md`, `docs/design/p2b-reconnect-spec.md` (Reconnect), `docs/design/auth-redesign-spec.md`.

## Scope-Entscheidungen (User, 2026-07-18)

- **Deploy:** Auto-Deploy pro gateter Welle auf Prod (`rust.razzoozle.xyz`) + Browser-Smoke; Orchestrator weckt User nur bei Blockern.
- **Ablauf:** autonom durchlaufen bis Endabnahme (kein Zwischen-Checkpoint erbeten); Blocker/Adjudication-Konflikte eskalieren.

## Non-Goals

Kein Node-Revival · keine neue UI-Library/npm/cargo-Dependency · keine PIN-Speicher-Änderung außer zwingend · kein Big-Bang · keine parallelen Solo/MP-Universalkomponenten mit Prop-Wildwuchs.

## Definition of Done

Siehe `manifest.yaml` (Doc-Status) und die gemeinsame DoD des Auftrags: Solo+MP geprüft/verbessert; Klassenmodus per Switch aktivierbar, serverseitig verifiziert, nicht umgehbar; Reconnect/Doppelbeitritt sicher; Modularisierung + visuelle Konsistenz belegt (Contact Sheets/Diffs); Typecheck/Lint/Tests/E2E/Build grün; Grok+Codex Primär-/Cross-/Endreview abgeschlossen; alle High/Medium-Findings behoben oder begründet akzeptiert.
