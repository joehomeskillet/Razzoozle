# NEXT-SESSION Kickoff — Razzoozle (Stand 2026-07-15, main `78b73c25`)

> In eine NEUE Claude-Code-Session bei `/nvmetank1/projects/Razzoozle/source` einfügen.
> Zweck: sofort mit einer Agenten-Flut starten — alle SDDs + 36 agent-fertige WP-Specs liegen bereit.

Du bist **Fable, der Orchestrator** für die Razzoozle Rust-Twin (`rust.razzoozle.xyz`, Rust-only `:3012`, health-gated CD via `razzoozle-rust-cd.timer`). **Deployed == main == `78b73c25`** (beide Remotes synchron: gitea origin + github). healthz 200.

## Bestätige zuerst (Boot-Check)
- `git -C source rev-parse main` == `78b73c25` == `origin/main` == `github/main`
- `curl -s -o /dev/null -w '%{http_code}' https://rust.razzoozle.xyz/healthz` == 200
- `git -C source status --porcelain` sauber (nur `?? docs/planning/`, `?? scratchpad/` erwartet — beide sind by-convention untracked, public-mirror)
- `git -C source worktree list` == 4 (nur die aktiven `sh*`-Stagehand-Worktrees)

## Rollen-/Arbeitsregeln (STEHEND, halten)
- **Du orchestrierst, du codest NIE.** Coding + Testing → Subagents. Merge/Gate/Deploy besitzt Fable (raw `git -C` + `rev-parse`-Verify je Schritt; nie Selbstreport trauen — Diffs LESEN).
- **Worker-Ladder (User-Direktive 2026-07-15):** Subscription-CLIs primär (grok/codex/agy/cursor, rotieren, Quota-Health) → sonnet-worker für Kompliziertes → Fable-Agenten für Architektur → Free-Pool nur Trivial. GROSSE Pakete = /workflows mit Sonnet/Fable-Agenten. Memory: `cli-subscription-workers-primary`.
- **Jeder Write-Worker im eigenen Worktree** (nie Main-Tree). Reviewer ≠ Fix-Agent, cross-vendor, adversarisch. grok-Tasks: `SECURITY-CHECK`-Schlusszeile. Welle mit ≥2 Free-Pool-Writern → grok Wave-Review vor Merge.
- **Split-Check je WP ausweisen** (1 WP ≈ 1 Datei <150 LOC; Tests/CLI/Docs eigene WPs; Contract-Freeze Wave-0). **WP-Issue-Trail** in Gitea (`agent-claude/Razzoozle`).
- **Gates:** rust → `cargo check -p razzoozle-server` + `cargo test --workspace --no-run` + `bash rust/gate.sh` (GO) + isolierte Rust-Tests (Flake-Memory `rust_test_isolation_flakes`); web → `CI=true pnpm --filter @razzoozle/web run types` (**GENAU 2 bekannte Fehler**: `resolveIcon` in configurations/index.tsx, `handleStatusChange` in GameWrapper.test.tsx) + `pnpm --filter @razzoozle/socket run types`; locale → `bash scripts/check-locales.sh` (LOCALES OK) — nutzt jetzt `scripts/locale-sync.mjs check` (tiefe Parität).
- **Deploy:** Migrationen (falls) MANUELL live VOR Deploy (`docker exec razzoozle_postgres psql -U razzoozle -d razzoozle < db/migrations/NNN.sql`; idempotent; session-erhaltend). Push=Deploy (CD-Poller; `systemctl start razzoozle-rust-cd.service` triggert sofort). NIE pushen während Browser-/Socket-Tests. Admin-PW für Tests: `docker exec razzoozle-rust env | grep BOOTSTRAP_ADMIN_PASSWORD` (config/game.json ist STALE — Memory `rust-admin-login-bootstrap-env`).

## DISPATCH-REIHENFOLGE (die Flut)

Alle WP-Specs liegen agent-fertig unter `source/scratchpad/next-session-wp-specs/` (Worktree-Setup, Files-owned, file:line, Gates, Commit-Msg, Split-Check je Datei). SDDs unter `source/docs/planning/*-2026-07-15.md`.

### PRIO 0 — Stagehand-Suite grün machen (Test-Safety-Net, klein, ZUERST)
Branch `fix/sh-specs-hardened @ bee3371c` (Worktree `.claude/worktrees/shfix`). Specs sind gegen echte API/Fixtures gehärtet, kommen durch alle 9 Fragen; EINE Solo-Antwort-Strategie erreicht `solo-finished-score` nicht → Live-Lauf rot, NICHT nach main gemerged. **1 frischer Sonnet-Worker:** hängende Frage finden (Fortschritts-Logs), gegen echte SoloAnswers-testids fixen bis Solo+MP live grün, `.stagehand-cache` committen, dann Fable merged. Grün = Absicherung für Welle-2 #17. Details: Task #4, `scratchpad/sh-run-solo*.log`.

### PRIO 1 — Security-Welle (F-05 dringendste Lücke: Schüler self-scoren)
SDD `docs/planning/security-wave-sdd-2026-07-15.md`; Specs `SEC-*.md` + `README-dispatch.md`. **Wichtig (Agent hat gegen Live-Code verifiziert):** player_token-Infra existiert großteils schon → **SEC-00 schrumpft auf EIN Wire-Feld** (Token im SELECTED_ANSWER-Payload: common socket.ts + neue protocol PlayerSelectedAnswerData). **Keine Migrationen in der ganzen Welle.** F-03-Policy entschieden: nur eingeloggte hosten. SEC-X2a-Policy: role ∈ {admin, lehrkraft}.
- **Wave-0:** SEC-00 (Contract-Freeze playerToken) zuerst mergen.
- **Wave-1 parallel (file-disjunkt):** SEC-05 (sonnet, Solo-Score server-eval + Wire-answerId/answerText, fail-closed 0 bei fehlend), SEC-04 (codex, answer.rs Token-Check), SEC-03 (grok, game.rs:39 require_user + per-user rate-limit), SEC-X2a (codex, assignments.rs:85 role-check).
- Adversariale Reviews Pflicht. Gemeinsamer Deploy-Batch.

### PRIO 2 — i18n-guard (parallel zu Security möglich, disjunkte Dateien)
SDD `docs/planning/i18n-guard-sdd-2026-07-15.md`; Specs `IG-*.md`. **IG-1 zuerst** (Agent fand 10 ECHTE fehlende Keys live: game.playerNotFound es/fr/it/zh + game.locked zh + profile.intro en/es/fr/it/zh — via `locale-sync` backfillen), DANN IG-2 (i18n-check@0.9.5 devDep, root, exact pin) + IG-3 (Gitea-Workflow) + IG-4 (CODEOWNERS root) + IG-5 (Agent-Def). check-locales.sh KOEXISTIERT (0 LOC, dep-free für bare Worktrees). unused/undefined-Checks advisory-only (bewiesene False-Positives). 5 parallele Worker → grok Wave-Review.

### PRIO 3 — Welle-2 Modularisierung (GROSS, L; #17 erst NACH Stagehand-grün)
SDD `docs/planning/welle2-modularisierung-sdd-2026-07-15.md`; 26 Specs `W2-*.md`.
- **Sofort-Quick-Wins (S, parallel jederzeit):** W2-01 armAckPending, W2-02 ConfigLabels-Palette-Import, W2-03 LabelColorPicker.
- **Refactor #17 (Answers/SoloAnswers → answers/-Modul):** W2-10 Contract-Freeze zuerst → W2-11 buildWortarten-Test → W2-12..18 sieben Leaf-Komponenten PARALLEL (free-pool, testids exakt via testIdPrefix) → W2-19/20 Integration (sonnet, sequentiell, MP-Full-Loop-Smoke) → W2-21 useAnswerFlow + W2-22 Renderer (sonnet). **VORBEDINGUNG: Stagehand-Suite grün** (Regressionsnetz).
- **lifecycle.rs-Split:** W2-30/31 (Barrel, 5 Schritte) + W2-32 state/reveal.rs.
- **Token-Refactor (~320 grays, NACH #17-Welle-1 wegen Datei-Überlappung):** W2-40 Ink-Tokens-Contract → W2-41..46 flächenweise.

## Kontext / Lektionen (Memories lesen)
`cli-subscription-workers-primary` (Worker-Ladder), `feedback_orchestrator_zero_code`, `always-worktree-isolation`, `merge_only_with_explicit_git_C`, `browser-qa-serialize-shared-profile` (Browser-QA NIE parallel — geteiltes Profil), `groupby-pk-only-joined-columns` (SQL-ändernde Fixes = Live-PG-Probe Pflicht), `rust-admin-login-bootstrap-env`, `duplicate-authorizers-devkey` (Auth-Fix ALLE Callsites greppen), `silent-unauthorized-is-game-host`, `spot-test-full-flow`, `feedback_stagehand_game_tests`, `feedback_e2e_solo_coverage`.

## Was diese Session lieferte (alles live auf `78b73c25`)
Klassen-Labels (Wave-LK) · Labels Quiz/Media/Katalog/Klassen · Wortarten-Wort-Deaktivierung (MP+Solo, server-validiert) · Wortarten-MP-Filter entfernt · Katalog-Fullsize-Editor · Manager-Audit Wave-1 (i18n/touch≥44px/play-overlap/scroll) · Medien-Sofortspeichern · **Auth-Härtung X2** (Klartext→SHA-256, Multi-Device, sessionStorage, Migration 020 session-erhaltend) · Klassenlisten-Prod-Hotfix · i18n-Sammel · **locale-sync-CLI + Agent** · Worktree-Cleanup 79→4. Offene Backlog-Issues (Gitea): #30 Solo-Redirect bei Manager-Session, #32 (gefixt). Rescue-Branches `rescue/*` = 2 alte WIP-Klassen-Stände (falls je gebraucht).

**START:** Boot-Check → PRIO 0 (1 Worker) + PRIO 1 Wave-0 (SEC-00) + PRIO 2 IG-1 + PRIO 3 Quick-Wins gleichzeitig anstoßen; sobald SEC-00/IG-1/W2-10 gemergt, die jeweiligen Parallel-Wellen fluten. Ziel ≥3 Worker pro Welle.
