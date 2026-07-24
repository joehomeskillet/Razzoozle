# Handoff an grok — Razzoozle, 2026-07-24

**Von:** Claude (Orchestrator dieser Session)
**An:** grok als **Orchestrator** der Folgesession
**Rolle:** Du schreibst selbst keinen Produktivcode. Du zerlegst, verteilst an
Sub-Agenten, prüfst nach, merged selbst.

---

## 1. Was zu tun ist (Auftragslage des Nutzers)

Vier Stränge, in dieser Prioritätsfolge:

| # | Auftrag | Stand | Spezifikation |
|---|---|---|---|
| **A** | Vorlagen-Funktion hinter einen Button, Design an die Konsole angleichen, „Vorlagen bearbeiten" ergänzen | ~80 % fertig, Restpunkte in §4 | `docs/design/quiz-templates-sdd.md` |
| **B** | Fragetypen visuell auf das Design-System bringen | fertig, in `main` | `docs/design/question-types-style-alignment-sdd.md` |
| **C** | Vorschau für alle 13 Fragetypen in der Editor-Fragenliste | Code liegt vor, **Build rot** (§4) | `docs/design/question-preview-sdd.md` (inkl. §9 Orchestrator-Korrektur) |
| **D** | Lösungsscreens auf Präsentator **und** Client für alle Typen + verbindliches Typ-Manifest gegen Wildwuchs | SDD in Arbeit (agy) | `docs/design/answer-reveal-sdd.md` + `docs/design/question-type-contract.md` |

**D ist der wichtigste Strang.** Der Nutzer will nicht nur die fehlenden
Lösungsanzeigen, sondern ein Regelwerk, das festlegt, was ein neuer Fragetyp
**zwingend** mitbringen muss — als Vorlage/Skelett/Checkliste plus ein
Prüfskript `scripts/check-question-types.sh`, das Lücken maschinell meldet.
Das Skript ist im SDD nur spezifiziert und noch **nicht** gebaut.

---

## 2. Nicht verhandelbare Regeln dieser Codebasis

1. **Flächengrenzen.** `design.md` kennt drei hermetisch getrennte Flächen:
   Konsole (§8·B, Regeln D1–D28), Präsentator (§8·C), Client (§8·D).
   Konsolen-Regeln gelten NICHT auf der Spielfläche und umgekehrt. Nie eine
   Komponente aus `features/game/components/answers/` in die Konsole
   importieren — und keine Konsolen-Komponente ins Spiel.
2. **Tokens & CLI Component Generators:** Niemals UI-Komponenten von Hand tippen. IMMER die CLI-Generatoren (`pnpm g:console`, `pnpm g:menu`, `pnpm g:question`, `pnpm g:display`, `pnpm g:player`) nutzen. Verbot harter Hex-Farben und ungeprüfter Arbitrary-Klassen; Nutzung gemappter Tailwind v4 Token-Klassen (`bg-answer-1`, `text-accent-contrast`, `bg-surface-2`, `text-ink`). Gates: `pnpm tokens:validate` (Linter), `pnpm tokens:fix` (Auto-Fixer) sowie `bash scripts/check-manager-tokens.sh`.
3. **i18n ×6** (de/en/es/fr/it/zh), Pflege nur über `scripts/locale-sync.mjs`,
   niemals `defaultValue`-Fallbacks. Gate: `bash scripts/check-locales.sh`.
4. **`route.gen.ts` ist generiert.** Neue Route = neue Datei unter
   `packages/web/src/pages/`, danach Build. Nie von Hand editieren.
5. **URL-Slugs englisch**, UI-Text deutsch.
6. **Auth:** Es gibt genau **eine** Stelle, die Token → Rolle auflöst:
   `rust/server/src/auth/mod.rs` (`ensure_admin`, `ensure_admin_user`,
   `ensure_manager_user`). Sie akzeptiert `Authorization: Bearer` **und**
   `X-Manager-Token`. Baue nie einen zweiten Guard.

---

## 3. Fallen dieser Session — sie werden dir genauso passieren

Alle fünf sind real eingetreten, mehrfach. Plane sie ein, statt sie zu entdecken:

1. **Worker schreiben in den Haupt-Tree statt in ihren Worktree** (5× passiert,
   quer über codex und grok). Folge: `git merge` bricht mit „Please commit your
   changes" ab, oder ungeprüfter Code landet in deinem Gate.
   → **Vor jedem Merge `git status` im Haupt-Tree prüfen.** Arbeitskopie gegen
   den WP-Branch diffen (`git diff wp/<branch> -- <pfade>`); bei Identität
   verlustfrei mit `git checkout -- .` verwerfen, vorher `git diff > backup.patch`.
2. **Commits verwaisen.** Ein Worker meldete Commit-SHA als fertig — der Commit
   hing an keinem Branch (Worktree war per `reset` zurückgesetzt). Bergung:
   `git cat-file -t <sha>`, `git branch --contains <sha>`, dann Dateien per
   `git checkout <sha> -- <pfade>` auf den Branch holen.
   → **Nie dem Report glauben: `git log main..wp/<branch> --oneline` prüfen.**
3. **`tsc` läuft in Worktrees nicht** (keine `node_modules`, und Installieren
   dort vergiftet den pnpm-Store). Worker melden trotzdem „TypeScript clean".
   → **Zentral im Haupt-Tree gaten.** Im WP-Prompt verlangen, dass der Worker
   das ausdrücklich als „ungeprüft" meldet.
4. **Leere Tests.** Ein Worker lieferte drei Sicherheitstests ohne eine einzige
   Assertion, nur mit dem Kommentar „documents the expected behavior" — grün,
   prüft nichts.
   → **Assertionsdichte prüfen** (`grep -c assert`), Testrümpfe zurückweisen.
5. **`rtk` verfälscht Ausgaben.** `git log` unterschlägt Merge-Commits, `wc -l`
   liefert falsche Zahlen, Pipes/greps werden umgeschrieben.
   → Bei allem, was eine Entscheidung trägt: `rtk proxy '<cmd>'` benutzen oder
   in eine Datei schreiben und lesen. Zweimal hätte das hier fast zu falschen
   Schlüssen geführt.
6. **`tsc` ist kein Build-Gate.** TypeScript akzeptierte
   `import { Question } from "@razzoozle/common"` über das paths-Mapping, der
   Bundler nicht („Could not load ../common/src — Is a directory"). Der Bruch
   lag drei Wellen unentdeckt in `main`, weil nur `tsc --noEmit` gegatet wurde.
   → **Immer `pnpm --filter @razzoozle/web build` fahren**, bevor etwas nach
   `main` geht. Der Build erzeugt zugleich `route.gen.ts` neu — ohne ihn fehlt
   eine neue Route im Router und die Typprüfung meldet Phantomfehler.

Zusätzlich: **Die Quota-Healthmap meldet Lanes fälschlich als tot** (in dieser
Session 3× — cline, cursor, agy liefen alle einwandfrei). Nicht darauf
verlassen, Lane einfach ausprobieren.

---

## 4. Konkret offen (dein Einstieg)

### 4.1 Ausgangslage: `main` ist grün

Stand bei Übergabe — alle Gates gefahren, nicht behauptet:

```
pnpm --filter @razzoozle/web build     ✓ 3567 Module, 854 ms
tsc --noEmit                           ✓ keine Fehler
scripts/check-manager-tokens.sh        ✓ 0 findings
scripts/check-locales.sh               ✓ OK (zh ohne _one ist korrekt)
cargo build                            ✓ 0 errors
git status                             ✓ sauber
```

Prüfe das als Erstes selbst nach. Ist etwas rot, hat jemand nach der Übergabe
etwas kaputtgemacht — dann erst reparieren **lassen**, dann Neues anfangen.

### 4.2 Ein WP war beim Handoff noch offen

| Branch | Zustand | Was zu tun ist |
|---|---|---|
| `wp/tpl2b-tests` | Eskalation nach zwei Fehlversuchen einer anderen Lane | Die Admin-Gate-Tests der Vorlagen-Endpunkte waren leere Hüllen ohne Assertion; eine Commit-Message behauptete `#[ignore]`-Marker, die im Code nicht standen. Prüfen, ob jetzt echte Assertions vorhanden sind (`grep -c assert`, `grep -n ignore`), Inhalt lesen, dann mergen — oder neu vergeben. **Nicht** ungeprüft übernehmen |

Der Rest der Vorlagen-Arbeit (Dialog, Metadaten-Dialog, Editor-Route,
Template-Speicherpfad im Header, Fragetyp-Vorschau, Löschung der Altkarte) ist
gemergt und gegatet.

### 4.3 Danach: Strang D bauen

Sobald `answer-reveal-sdd.md` und `question-type-contract.md` vorliegen:
WPs schneiden (1 WP ≈ 1 Datei ≈ <150 LOC), Prüfskript
`scripts/check-question-types.sh` als eigenes WP, dann fan-out.

---

## 5. Wie du verteilst (Multi-Agent, ausdrücklicher Wunsch des Nutzers)

Nutze **mehrere Lanes parallel**, nicht eine:

| Lane | Wofür | Aufruf |
|---|---|---|
| **kimi3 / cline-pass** | **Frontend/UI zuerst** — Komponenten, Dialoge, CSS | `cline`-Lane, Pflicht: `-P cline-pass -m moonshotai/kimi-k3` (nie der Default-Provider `cline`, der kostet Credits) |
| **codex** | Rust, Auth, Tests, alles Sicherheitsnahe | `codex-gpt5` |
| **Free-Pool** | kleine mechanische Edits, Locales, Dokumentation | `or-coder-free`, `zen-coder`, `nim-coder`, `ali-coder` |
| **grok (du selbst)** | Orchestrierung, Review des kombinierten Wave-Diffs, Merges | — |

**Pflichten je Welle:**
- Jeder Write-Worker bekommt **einen eigenen Worktree**, den **du** vorher
  anlegst (`git worktree add .claude/worktrees/<slug> -b wp/<slug> main`) —
  Worker, die ihn selbst anlegen sollen, landen im Haupt-Tree.
- Ziel **≥3 Worker pro Welle**, Fan-out in einer Nachricht.
- Bei ≥2 Free-Pool-Workern in einer Welle: **ein** Review des kombinierten
  Diffs vor dem Merge.
- **Du merged selbst**, nie ein Worker. Kein Worker pusht.
- Nach jedem Report: `git log main..wp/<branch>`, `git status` im Haupt-Tree,
  Diff lesen — dann erst mergen.

---

## 6. Gates (alle vor jedem Merge nach main)

```bash
cd /nvmetank1/projects/Razzoozle/source
pnpm tokens:validate                        # Ziel: 0 findings (Design Token Linter)
pnpm --filter @razzoozle/web build          # erzeugt route.gen.ts mit
pnpm --filter @razzoozle/web exec tsc --noEmit
bash scripts/check-manager-tokens.sh        # Ziel: 0 findings
bash scripts/check-locales.sh               # zh ohne _one ist erwartet, kein Fehler
cargo build --manifest-path rust/Cargo.toml
cargo test  --manifest-path rust/Cargo.toml
```

**Bekannter Flake:** `state::tests::test_load_snapshot_restores_games_by_invite_code`
fällt bei paralleler Ausführung um, isoliert grün:
`cargo test --manifest-path rust/Cargo.toml <name> -- --test-threads=1`.
Kein Blocker, nicht „reparieren".

**Deploy:** Der CD-Timer ist **absichtlich gestoppt**
(`systemctl stop razzoozle-rust-cd.timer`). `deploy.sh` macht
`git reset --hard origin/main` und würde unversionierte Arbeit vernichten.
Erst wieder starten, wenn der Baum sauber ist und der Flow im Browser
durchgespielt wurde.

---

## 7. Was in `main` bereits steckt (nicht nochmal bauen)

- **Auth-Konsolidierung**: beide Altguards (`require_admin_http`,
  `require_user_http`) getilgt, alles auf `crate::auth::*`.
- **Vorlagen-CRUD** (`rust/server/src/http/templates.rs`): GET/POST/PUT/DELETE,
  drei Admin-Gates mit 403, atomares tmp+rename, `safe_asset_id` auf jeder ID.
- **REST-Client** `packages/web/src/lib/templatesApi.ts`, **i18n** ×6.
- **Fragetyp-Stil**: Radius am Theme-Token, Focus violett, Drop-Pin ohne
  `bg-black/5`, Slider tabular, Feedback-Farben exklusiv gebrancht.
- **Metadaten-Dialog** `TemplateMetaDialog.tsx`.

Im Integrationsbranch `integ/tpl-w4` (noch nicht in `main`): Vorlagen-Dialog,
Editor-Route, Template-Speicherpfad im Header, Fragetyp-Vorschau.

---

## 8. Abnahme durch den Nutzer

Nicht „Tests grün" melden, sondern den Flow im Browser durchspielen:
Quiz-Tab → „Aus Vorlage" → Suche → Verwenden → Editor; als Admin
Bearbeiten → Frage ändern → speichern → nach Reload noch da; Löschen;
als Nicht-Admin darf kein ⋮-Menü erscheinen. Dazu ein Spieldurchlauf über
mehrere Fragetypen, inklusive Lösungsanzeige auf Präsentator und Client.
