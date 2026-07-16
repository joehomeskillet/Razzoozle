# SDD — Welle 2: Modularisierung + Reuse + Token-Refactor (2026-07-15)

Quelle: End-Audit `scratchpad/end-audit-findings-2026-07-15.json` (Dimension
"Modularisierung + Reuse" + Ponytail-Pass + Synthese). Diese SDD deckt NUR den
Modularisierungs-/Reuse-Block ab. Die Security-HIGHs (F-03/04/05, X2a) haben
eine EIGENE SDD und laufen VOR dieser Welle (siehe Task "Security-Welle").

## 1. Scope

1. **Refactor #17** — `Answers.tsx` (1094 LOC) + `SoloAnswers.tsx` (785 LOC):
   ~700 LOC per-Fragetyp-Duplikation (7 Typen: choice, multiple-select,
   slider, type-answer, mathematik, wortarten, sentence-builder) → neues Modul
   `packages/web/src/features/game/components/answers/`. 3-Wellen-Plan
   (Contract-Freeze → Leaf-Komponenten → Hook/Renderer).
2. **`rust/server/src/socket/lifecycle.rs` (1339 LOC)** → `socket/lifecycle/`-
   Barrel in 5 Schritten (tests → payloads → timing → question → run).
3. **`rust/engine/src/state/mod.rs`**: `reveal()` (365 LOC, Zeile 294–659) →
   `state/reveal.rs` (impl-Block-Muster wie `achievement_awards.rs`).
4. **Manager-Token-Refactor**: ~445 hartkodierte `gray-*`-Klassen im Manager
   (326 configurations/, 70 ResultModal/, 49 console/) → Design-Tokens.
   Wert-erhaltend (kein visueller Diff). NACH #17-Welle-1 einplanen
   (Reihenfolge-Direktive aus dem Audit wegen Datei-Überlappung).
5. **Quick-Wins**: `armAckPending`-Helper (5x duplizierter LL-Ack-Block in
   Answers.tsx, MUSS vor #17 landen), `LabelColorPicker`-Extraktion,
   `ConfigLabels`-Palette-Import (+ Label-Interface-Dedup).

### Non-Goals
- KEINE Logikänderungen in Rust-Moves (Abort/Pause-Semantik, Auth/Ownership-
  Checks bleiben byte-gleich — Memory `duplicate_authorizers_devkey`: Auth-
  Dedup ist ein separates adversariales WP, nicht diese Welle).
- KEINE Wire-Änderungen: normal-mode Payloads bleiben byte-identisch
  (`gf_accepted_wire_cosmetics`).
- KEIN Split von `eval.rs` (Audit: Nicht-Kandidat, Tests > Prod-Anteil).
- KEINE neuen Dependencies, keine Migrationen (021+ nur falls unerwartet).
- `manager/classes.rs` + `db/classes.rs`-Splits: bewusst NICHT in dieser
  Welle (Backlog; gleiche Schnittlinie, ein Reviewer, eigene Mini-Welle).

## 2. Harte Voraussetzungen (Gate vor Dispatch)

1. **Stagehand-Suite MUSS grün sein, BEVOR irgendein #17-WP gemergt wird.**
   Task #4 (Stagehand-Testwelle #18: MP voller Loop + Solo 9 Typen × 3
   Viewports) abschließen; `e2e/answer-flow.spec.ts` existiert bereits (MP
   all-types + race conditions), Solo×Viewport-Abdeckung komplettieren
   (Pflicht-Memory `e2e_solo_coverage`). Baseline-Lauf grün dokumentieren.
2. **Security-Welle-1 (F-05/F-04/F-03) vor dieser Welle** — Synthese-Zitat:
   "Ohne die HIGHs gefixt ist jeder weitere Feature-Merge auf Sand gebaut."
3. **W2-01 (armAckPending) MUSS vor W2-19 (Answers-Integration) gemergt sein**
   (reduziert den #17-Diff, fixt den type-answer-Ack-Drift).

## 3. Wellenplan + Abhängigkeiten

```
Welle A (parallel, sofort):      W2-01 armAckPending · W2-02 ConfigLabels-Palette
                                 W2-03 LabelColorPicker · W2-30 lifecycle Schritte 1-3
                                 W2-32 state/reveal.rs
Welle B (nach A):                W2-10 answers/-Contract-Freeze · W2-31 lifecycle 4-5 (base: W2-30)
Welle C (nach W2-10, parallel):  W2-11 buildWortartenAnswer-Test
                                 W2-12 ChoiceGrid · W2-13 MultiSelectGrid · W2-14 SliderInput
                                 W2-15 TypeAnswerInput · W2-16 MathematikInput
                                 W2-17 WortartenPicker · W2-18 SentenceBuilderBoard
Welle D (sequentiell):           W2-19 Answers.tsx-Integration (MP) → Full-Loop-Smoke
                                 → W2-20 SoloAnswers.tsx-Integration → Solo-Smoke
Welle E (sequentiell, nach D):   W2-21 useAnswerFlow → W2-22 QuestionAnswerRenderer
Welle F (nach D = #17-Welle-1):  W2-40 Ink-Token-Contract
Welle G (nach W2-40, parallel):  W2-41…W2-46 Gray-Batches (6 WPs)
```

- Rust-Lane (W2-30/31/32) ist von der Web-Lane komplett unabhängig →
  parallel zu A–E fahrbar.
- Welle E kann NACH Welle D auch parallel zu F/G laufen (disjunkte Dateien:
  game/ vs manager/), ABER W2-21/22 sind untereinander sequentiell.
- Nach JEDER Welle: deploy + ausgiebig testen (Memory
  `deploy_and_test_per_wave`), Full-Loop-Browser-Smoke (Memory
  `spot_test_full_flow`) — Lobby erreichen ist KEIN Pass.

## 4. WP-Übersicht (26 WPs, Specs in `scratchpad/next-session-wp-specs/`)

| WP | Titel | Files (owned) | Lane | Hängt ab von |
|---|---|---|---|---|
| W2-01 | armAckPending-Helper + type-answer-Drift-Fix | Answers.tsx | local-coder-ov / free-pool | — |
| W2-02 | ConfigLabels-Palette-Import + Label-Interface-Dedup | ConfigLabels.tsx, useLabelManager.ts | free-pool | — |
| W2-03 | LabelColorPicker-Extraktion | LabelColorPicker.tsx (neu), Create/EditLabelDialog.tsx, labels/index.ts | grok-build | — |
| W2-10 | answers/-Contract-Freeze | answers/types.ts, SubmitButton.tsx, buildWortartenAnswer.ts (alle neu) | codex-gpt5 | — |
| W2-11 | Unit-Test buildWortartenAnswer | buildWortartenAnswer.test.ts (neu) | free-pool | W2-10 |
| W2-12 | ChoiceGrid (MP-Hot-Path!) | answers/ChoiceGrid.tsx (neu) | sonnet-worker | W2-10 |
| W2-13 | MultiSelectGrid | answers/MultiSelectGrid.tsx (neu) | free-pool | W2-10 |
| W2-14 | SliderInput | answers/SliderInput.tsx (neu) | free-pool | W2-10 |
| W2-15 | TypeAnswerInput | answers/TypeAnswerInput.tsx (neu) | grok-build | W2-10 |
| W2-16 | MathematikInput | answers/MathematikInput.tsx (neu) | codex-gpt5 | W2-10 |
| W2-17 | WortartenPicker | answers/WortartenPicker.tsx (neu) | cursor-gpt5 | W2-10 |
| W2-18 | SentenceBuilderBoard | answers/SentenceBuilderBoard.tsx (neu) | codex-gpt5 | W2-10 |
| W2-19 | Integration Answers.tsx (MP) | Answers.tsx | sonnet-worker | W2-01 + W2-12…18 |
| W2-20 | Integration SoloAnswers.tsx | SoloAnswers.tsx | sonnet-worker | W2-19 |
| W2-21 | useAnswerFlow-Hook | answers/useAnswerFlow.ts (neu), Answers.tsx, SoloAnswers.tsx | sonnet-worker | W2-20 |
| W2-22 | QuestionAnswerRenderer + Final-Slimming | answers/QuestionAnswerRenderer.tsx (neu), Answers.tsx, SoloAnswers.tsx | sonnet-worker | W2-21 |
| W2-30 | lifecycle-Split Schritte 1–3 (tests/payloads/timing) | socket/lifecycle.rs → lifecycle/{mod,tests,payloads,timing}.rs | grok-build | — |
| W2-31 | lifecycle-Split Schritte 4–5 (question/run) | lifecycle/{mod,question,run}.rs | sonnet-worker | W2-30 |
| W2-32 | state/mod.rs reveal() → state/reveal.rs | engine state/mod.rs, state/reveal.rs (neu) | grok-build | — |
| W2-40 | Ink-Token-Contract (index.css) | packages/web/src/index.css | codex-gpt5 | W2-19+W2-20 gemergt |
| W2-41 | Grays-Batch klassen+schueler (~69) | configurations/klassen/, schueler/ | cursor / css-bugfixer | W2-40 |
| W2-42 | Grays-Batch submissions+ConfigMedia (~82) | configurations/submissions/, ConfigMedia/ | free-pool | W2-40 |
| W2-43 | Grays-Batch catalog/ai/labels/quizzes/Achievements (~80) | die 5 Ordner | free-pool | W2-40 |
| W2-44 | Grays-Batch configurations-Rest (~95) | restliche configurations-Files | cursor / css-bugfixer | W2-40 |
| W2-45 | Grays-Batch ResultModal (~70) | manager/components/ResultModal/ | free-pool | W2-40 |
| W2-46 | Grays-Batch console + Manager-Top-Level (~57) | console/, DisplayControl/DisplayStatusCard/SimControl u.a. | free-pool | W2-40 |

**Split-Check (global):** jedes WP ≈ 1 Datei bzw. 1 mechanischer Batch
< ~150 LOC Diff; Tests eigenes WP (W2-11); Contract eigenes WP (W2-10, W2-40).
Ausnahmen begründet: W2-19/20/21/22 fassen die beiden Bestandsdateien an —
untrennbare Ein-Datei-Integrationslogik, deshalb sequentiell + sonnet-worker.
W2-30/31 arbeiten auf derselben Datei → nicht parallelisierbar, Split nach
Tier-Grenze (mechanisch vs. Kernlogik). Wellen C und G haben ≥7 bzw. 6
parallele Worker (Fan-out-Ziel ≥3 erfüllt).

## 5. Dispatch- + Review-Regeln

- Subscription-CLIs primär (grok/codex/agy/cursor, Pools abwechseln),
  sonnet-worker für Kompliziertes (ChoiceGrid, Integrationen, Hook,
  lifecycle-Kern), Free-Pool nur Trivial. `claude-quota-healthmap` vor Fan-out.
- **Reviewer ≠ Fix-Agent, cross-vendor, adversarisch** (Memory
  `cli_output_crosscheck`): jeder Worker-Diff wird vor Merge von einem
  anderen Vendor gegengelesen.
- Welle mit ≥2 Free-Pool-Writern (C, G) → **grok Wave-Review** über den
  kombinierten Wave-Diff VOR Merge, Schlusszeile `WAVE-REVIEW: CLEAN|FINDINGS(n)`.
- grok-Tasks enden mit SECURITY-CHECK-Schlusszeile.
- Worktree-Pflicht je Worker (Setup-Kommandos stehen in jeder WP-Spec);
  nach Dispatch Isolation verifizieren (Memory `cli_worker_maintree_spillover`:
  codex/or-agent schreiben gern in den Main-Tree).
- Fable merged selbst: Diffs lesen, re-gaten, dann Merge via
  `git -C /nvmetank1/projects/Razzoozle/source` (Memory
  `merge_only_with_explicit_git_C`); stale Worktrees vor Merge auf main
  rebasen; `routing-outcome record` pro Worker.

## 6. Test-Absicherung

| Ebene | Gate | Wann |
|---|---|---|
| Stagehand answer-suite (Fragetyp × MP+Solo × 3 Viewports) | grün | VOR #17, nach W2-19, W2-20, W2-21, W2-22 (act-cache = billige Reruns) |
| MP-Full-Loop-Browser-Smoke (login→create×2→START→alle Typen→reveal→finish) | manuell/stagehand | nach jeder Welle |
| Web types | `CI=true pnpm --filter @razzoozle/web run types` — GENAU 2 bekannte Fehler erlaubt (resolveIcon in configurations/index.tsx, handleStatusChange in GameWrapper.test.tsx) | jedes Web-WP |
| Locale | `bash scripts/check-locales.sh` → LOCALES OK | jedes Web-WP |
| Unit | `pnpm --filter @razzoozle/web run test` (vitest) | W2-11 + Regression in D/E |
| Rust | `cargo check -p razzoozle-server` + `cargo test --workspace --no-run` + `bash rust/gate.sh` → GO | jedes Rust-WP, je Schritt-Commit |
| Engine | `cargo test -p razzoozle-engine` isoliert (Flake-Memory `rust_test_isolation_flakes`: test_within_rate + snapshot-invite flaken parallel → isoliert + rerun) | W2-32, W2-30/31 |
| Wire-Parity | emitted Payloads byte-identisch im normal-mode (Stichprobe via e2e_game_diff, SEQUENTIELL — shared PG) | nach W2-19/20/21 |
| Visuell | Screenshot-Vergleich betroffener Manager-Tabs (Token-Swap ist wert-erhaltend → Null-Diff-Erwartung) | W2-41…46 |

## 7. Risiken (aus dem Audit übernommen — bindend)

1. **MP-Hot-Path**: Press-Feedback MUSS CSS-only bleiben (200-Spieler-Räume).
   Solo-motion-Wrapper (framer-motion) NICHT in den MP-ChoiceGrid einschleppen
   → `feedback`-/Varianten-Prop steuert das, MP-Renderpfad bleibt motion-frei.
2. **Wire-Parity**: normal-mode Payloads byte-identisch halten
   (`gf_accepted_wire_cosmetics`); Leaf-Extraktion darf Submit-Payloads nicht
   umformen.
3. **LL-Ack-Semantik** (clientMessageId, ackPending-Timer) bleibt in
   Answers.tsx — NICHT in Leaves, NICHT im Hook.
4. **data-testids EXAKT erhalten** — die e2e-Suite hängt daran;
   `testIdPrefix: '' | 'solo-'` reproduziert die Bestandswerte byte-genau.
5. **Rust-Moves verbatim**: Sichtbarkeiten (`pub(crate)`) beibehalten,
   Re-Exports für die 8 lifecycle-Konsumenten, KEINE Abort/Pause-Änderung,
   KEIN Auth-"Aufräumen" beim Verschieben.
6. **Rust-Worker regressieren gern** (Memory `rust_worker_worktree_gate`) →
   Worktree + deterministisches gate.sh Pflicht, Fable liest Diffs.
7. **Token-Swap**: wert-erhaltend (gleiche Hex-Werte hinter neuen Tokens),
   sonst visuelle Drift über 26 Dateien.
8. PWA-Cache nach Deploy busten (Memory `pwa-service-worker-cache-stale`).

## 8. Merge-/Deploy-Ablauf pro Welle

1. Worker-Diffs lesen (Selbstberichten nie trauen), Pollution-Check
   (`git status` im Worktree), cross-vendor Review, ggf. Wave-Review.
2. Worktree auf main rebasen, re-gaten, Merge via `git -C <main-tree>`.
3. Auf BEIDE Remotes pushen (Memory `regular_github_autosave`).
4. Deploy + Stagehand-Suite + Full-Loop-Smoke.
5. `routing-outcome record` pro Worker; Worktree-Cleanup.
