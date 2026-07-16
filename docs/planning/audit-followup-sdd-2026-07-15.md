# Audit-Followup SDD — konsolidiert (2026-07-15, main 8c9d433f)

Basis: 2 Verifikations-Workflows gegen Live-Code (manager-audit-verify, other-audits-verify). Die Roh-Audits (manager-30, game-uiux-17, end-audit-security, dead-code) waren grösstenteils bereits abgearbeitet; hier nur das **verifiziert-offene**. User-Entscheide (2026-07-15): save-behavior = immediate überall; Label-Add-Mode aktivieren; Umfang = Wellen 0-4 komplett.

Konventionen: 1 WP ≈ 1 Datei <150 LOC; Worktree-Isolation; Reviewer ≠ Fixer cross-vendor; Fable merged (raw git -C, Diffs lesen); Gates rust=`bash rust/gate.sh` (GO, von root) + `CI=true pnpm --filter @razzoozle/web run types` (GENAU 2 bekannte Fehler) + `check-locales.sh` (LOCALES OK). Keine Migrationen in Welle 0.

## Welle 0 — Security-Mediums (ZUERST, eigener Deploy + Test)
- **SEC-M1 — Session-Revocation bei PW-/Rollen-Change** (`rust/server/src/db/users.rs`, Caller `http/users.rs:220,279`). `set_password` (:292) macht nur UPDATE; keine Session-Invalidierung → alte Tokens bleiben gültig. Fix: nach PW-Update UND nach Rollen-Update `DELETE FROM sessions WHERE user_id = $1`. Nuance: Admin-Reset = alle Sessions; Self-Service-PW-Change = aktuellen Token behalten (`AND token_hash <> $2`). Owner: db/users.rs (+ ggf. http/users.rs Call-Site). Tests: PW-Change invalidiert Fremd-Sessions, behält eigene. Lane: sonnet (auth-kritisch). Review: codex.
- **SEC-M2 — END_GAME/LEAVE Owner-Check** (`rust/server/src/socket/manager/games_list.rs`). END_GAME (:74-126) + LEAVE (:128-181) prüfen nur client-gelieferte `client_id` (nicht secret) → fremdes Game teardownbar (DoS). Fix: `is_game_host(&game, &payload, &ctx.client_id, require_user().await.as_ref())` in beide Handler vor Reset/Teardown; warn! auf Deny (Memory silent-unauthorized). Lane: codex. Review: grok.
- Disjunkt (db/ vs socket/manager/). Parallel. Nach Merge: Deploy + Repro (PW-Reset kickt Sessions; fremder END_GAME/LEAVE → denied).

## Welle 1 — Token-Refactor (411 grays + answer-rings)
- **T-0 Ink-Token-Contract** (`packages/web/src/index.css` @theme): value-erhaltende `--ink`/`--ink-muted`/`--ink-subtle`/`--ink-faint`/`--surface-2`/`--line` + `--ring-selected` (ersetzt ring-white/80). Mapping-Kommentar = Contract. Spec-Vorlage: `scratchpad/next-session-wp-specs/W2-40-ink-tokens-contract.md`. Owner: codex. Fable reviewt Token-Namen/Werte. ZUERST mergen.
- **T-1..5 grays anwenden** (nach T-0, parallel, file-flächig): configurations/ (299), ResultModal/ (63), console/ (41), Rest/Icons. Rein mechanisch gegen die Mapping-Tabelle, wertgleich (null visueller Diff). Lane: free-pool. grok Wave-Review.
- **T-6 answer-tile rings** (`answers/ChoiceGrid.tsx`, `MultiSelectGrid.tsx`): `ring-white/80` (4 selected + 2 hover) → `ring-[var(--ring-selected)]`. MP+Solo byte-visuell identisch (Wert = weiss, aber tokenisiert). Lane: free-pool/grok.

## Welle 2 — Touch-Targets (trivial, 1 WP)
- `schueler/StudentList.tsx:160,172` size-9 → size-11; `catalog/ConfigCatalog.tsx:213-214` min-h-9 → min-h-11; `CatalogQuestionModal.tsx:140` close size-10 → size-11. Alle ≥44px. Lane: free-pool. Review: cross-vendor.

## Welle 3 — Shared-Component-Dedup
- **D-0 FilterPill** (`components/…/FilterPill.tsx` NEU) + Konsumenten (ConfigCatalog scope, ConfigSubmissions status). 
- **D-1 Badge** (`components/…/Badge.tsx` NEU) ersetzt 3× `rounded-full bg-gray-200 px-2.5 py-0.5 …` (Catalog/Submissions/MediaInfo) — nutzt Ink-Tokens (nach Welle 1).
- **D-2 PageHeader** (`components/…/PageHeader.tsx` NEU) standardisiert 5 divergente Header-Layouts. Contract-Freeze der Props zuerst, dann Konsumenten. Lane: sonnet (Komponenten), free-pool (Konsumenten). design-validator-Gate.

## Welle 4 — UX (Entscheidungen gesetzt)
- **UX-1 save-behavior immediate**: Catalog-Label-Zuweisung auf on-toggle-Speichern (LABEL.ASSIGN) umstellen wie Media/Classes. Owner: catalog-Komponente(n). Lane: sonnet.
- **UX-2 label-add-mode**: `CatalogQuestionForm.tsx:156,:82-88` editingEntry?.id-Gate lösen → Labels im Add-Mode zuweisbar; Datenverlust-Lücke geschlossen. Lane: sonnet.

## Backlog (nach Flood, kein kritischer Pfad)
- 5 verwaiste ai.ts-Request-Validatoren (`packages/common/src/validators/ai.ts`, ~30 LOC) — Re-Gate dann delete.
- lifecycle W2-31/32 (Schritte 4-5 + state/reveal.rs) — Refactor, kein Audit-Item.

## Reihenfolge / Deploy
Welle 0 (Security) → Deploy+Test → Welle 1 T-0-Contract merge → T-1..6 flood → Deploy → Welle 2+3 → Welle 4 → Deploy → Stagehand-Regression + Manager-Browser-Smoke pro Deploy-Batch.
