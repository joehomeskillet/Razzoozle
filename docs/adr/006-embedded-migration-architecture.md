# ADR 006 — Eingebettete Migrations-Architektur via SQLx

Datum: 2026-07-29 · Status: angenommen · Kontext: WP-DCK-05, #796

## Kontext

Razzoozle verwaltet Datenbankmigrationen über zwei Systeme:

1. **Bash-Skript** (`scripts/migrate-apply.sh`): Liest SQL-Dateien, sortiert sie nach Versionsnummer, wendet sie per `psql` an. Kein Ledger, kein Fehlerschutz bei Doppel-Anwendung.

2. **Rust-Embedded Migrator** (`razzoozle-server migrate`): Nutzt SQLx's `sqlx::migrate!()` Makro, verwaltet `_sqlx_migrations` Ledger-Tabelle, idempotent, parallel-safe via advisory locks.

**Das Gefahrenmuster:** Eine bestehende Produktionsumgebung hat alle 22 Migrationen über Bash angewendet (ohne Ledger). Will man später auf den Rust-Migrator umsteigen, schlägt Migration 001 fehl (`CREATE DOMAIN` ohne `IF NOT EXISTS`), weil die Domain bereits existiert. Das Bash-Skript könnte in unkontrollierter Umgebung Migrationen erneut anwenden.

**Beide Systeme gleichzeitig auszuführen ist gefährlich:** Das Bash-Skript kennt das Ledger nicht, der Rust-Migrator nicht die Bash-Historie.

## Entscheidung

Der **Rust-Embedded Migrator ist die Standard- und zukunftsgerichtete Architektur für alle Umgebungen.** Das Bash-Skript wird zu Notfall-/Fallback-Only degradiert und ist nicht Teil der regulären Migrations-Pipeline.

**Konkret:**

1. **Neue Umgebungen:** Verwenden ausschließlich `razzoozle-server migrate`.
2. **Rust-Migrator ist Standard:** Ist in der Deployments-Pipeline (Docker CMD, Kubernetes Init-Container, usw.) aufgerufen.
3. **Bash-Skript ist deprecated:** Bleibt im Repo als lokales Entwicklungswerkzeug + Notfall-Fallback, wird aber nicht automatisiert aufgerufen.
4. **Bestehende Produktionsumgebungen:** Benötigen eine **einmalige manuelle Baseline-Initialisierung**, bevor der Rust-Migrator zum Einsatz kommt:
   - Manuell die 22 bereits angewendeten Migrationen ins `_sqlx_migrations` Ledger eintragen (mit Dummy-Timestamps, `success=true`)
   - Keine erneute Ausführung der SQL-Dateien
   - Nach dieser Baseline kann der Rust-Migrator uneingeschränkt arbeiten
5. **Pre-Sqlx Zustand ist erkannt:** Der Rust-Migrator erkennt Umgebungen ohne Ledger als "pre-sqlx" (kein Fehler) und warnt in den Logs, anstatt zu blocken. Eine Readiness-Probe (`/readyz`) wird grün, solange keine Ledger-Tabelle existiert oder alle Migrationen im Ledger vollständig sind.

## Konsequenzen

### Positive
- **Idempotenz:** Jede Migration wird maximal einmal ausgeführt (SQLx Ledger), kein Risiko von Doppel-Anwendung.
- **Parallel-Sicherheit:** SQLx nutzt PostgreSQL advisory locks, mehrere Container können gleichzeitig Migrationen ausführen, ohne Konflikte.
- **Fehlerschutz:** Fehlgeschlagene Migrationen werden im Ledger aufgezeichnet, der Migrator springt nicht über Fehler.
- **Wartbarkeit:** Eine Quelle der Wahrheit (Rust-Code + SQLx Ledger), nicht zwei unabhängige Systeme.
- **Automatisierung:** Der Rust-Migrator kann in CI/CD-Pipelines, Init-Containern, usw. verankert werden, ohne zusätzliche Bash-Abhängigkeiten.

### Kosten
- **Einmaliger Overhead für Prod:** Baseline-Initialisierung muss manuell durchgeführt werden, sobald man auf Rust-Migrator umschaltet. Ein SQL-Skript zur Ledger-Initialisierung wird bereitgestellt.
- **Keine sofortige Umstellung:** Der Bash-Skript bleibt kurzzeitig nutzbar, um bestehende Umgebungen nicht zu unterbrechen. Nach Baseline können ältere Skripte gelöscht werden.

### Keine Doppel-Anwendung
- Der Rust-Migrator führt Migrationen nicht erneut aus, wenn sie im Ledger aufgezeichnet sind, auch wenn die SQL-Dateien noch vorhanden sind.
- Der Bash-Skript wird nicht automatisch aufgerufen und kann nur manuell/ad-hoc verwendet werden (z.B. Notfall, Offline-Umgebung).

### Neue Entwickler
- Lokal entwickelnde Entwickler führen `razzoozle-server migrate` aus oder starten den Server (was Migrationen via CLI aufruft).
- Das Bash-Skript ist optional und für Edge-Cases.

## Referenzen

- `rust/server/src/migrate.rs`: Embedded migrator, Pre-Sqlx Erkennung, Ledger-Semantik
- `scripts/migrate-apply.sh`: Bash-basierte Migrationen (deprecated, Notfall-Fallback)
- `db/migrations/`: 22 SQL-Dateien, von 001_initial_schema.sql bis 022_*
- Issue #796: Baseline-Initialisierung für bestehende Prod-Umgebungen
- WP-DCK-05: Migrations-Architektur Design-Review
