# Contributing to Razzoozle

Thanks for your interest. Razzoozle is a fork of [Ralex91/Razzia](https://github.com/Ralex91/Razzia), released under the MIT License.

## Development

```bash
pnpm install
pnpm dev        # web + socket with hot reload
```

It's a pnpm monorepo with Rust backend:
- `@razzoozle/web` (React 18 + Vite + Tailwind v4)
- `@razzoozle/common` (shared Zod types)
- `@razzoozle/mcp` (MCP server, host-only dev tool, excluded from workspace)
- `razzoozle-server` (Rust backend, socket + HTTP handlers)
- `razzoozle-engine` (Rust game logic)
- `razzoozle-protocol` (Rust wire types, ts-rs bindings)

## Before opening a PR

Run the full gate and keep it green:

```bash
pnpm verify     # design check + typecheck + linting + tests
```

The gate runs:
1. `pnpm tokens:gate` — design system integrity check
2. TypeScript type-checking across all packages
3. oxlint (linter for JS/TS/React)
4. All test suites (packages/ and rust/)

Additional verification:

```bash
bash rust/gate.sh  # Rust-specific typecheck + tests
pnpm e2e          # End-to-end tests (Playwright)
pnpm i18n:check   # Locale coverage validation
```

### Code Style

- **TypeScript/React:** Match surrounding code. Prettier + oxlint enforce style. Run `pnpm format:fix` to reformat.
- **Rust:** `cargo fmt` handles style; `cargo clippy` catches idioms. No pre-commit hook, but gate.sh runs both.
- **UI Components:** Use the design system. Never hardcode hex colors or arbitrary class names (`#7c3aed`, `bg-[#xyz]`). Always use mapped Tailwind v4 token utilities (`bg-brand-primary`, `bg-answer-1`, etc.). See `CLAUDE.md` for component scaffold generators.

### Testing

- **Add or update tests for behavior changes.** Unit tests in `packages/*/src` and `rust/*/src`; integration tests in `source/e2e/`.
- **UI tests:** Use Playwright (e2e) or Vitest (component unit tests).
- **Rust tests:** Run `cargo test --all` from the rust/ directory.

### Localization

- **Keep user-facing strings translated across all six locales:** `packages/web/src/locales/de/`, `en/`, `es/`, `fr/`, `it/`, `pt-br/`.
- Run `pnpm i18n:check` to validate coverage.
- Do NOT modify namespace JSON files manually; use the manager's **Locales** tab to author strings, or coordinate with the i18n system.

### Database Migrations

- New schema changes go in `rust/server/src/db/migrations/NNN_description.sql` (sequential numbering).
- Migrations run automatically on startup.
- Test locally before committing: `cargo sqlx prepare --database-url $DATABASE_URL`.

## Protocol Types

**Rust is the authoritative source.** New protocol types (socket events, payloads, enums) are defined in `rust/protocol/src/` with `#[derive(ts)]` from the ts-rs crate. TypeScript bindings are auto-generated to `rust/protocol/bindings/` and committed.

- **Never manually edit** `rust/protocol/bindings/*.ts`.
- **After editing `rust/protocol/src/`**, run `cargo build -p razzoozle-protocol` to regenerate bindings, then commit both Rust source and bindings.
- Stale TypeScript definitions in `packages/common/src/types/game/socket.ts` are kept for backward compatibility but are not updated; use the generated bindings or hand-synced Zod validators instead.

## Module Boundaries

Razzoozle follows strict layering: see `docs/module-boundaries.md` for import rules, crate purposes, and modularization guidelines.

## Reporting Issues

Use the issue templates. Include steps to reproduce, expected vs actual behavior, and your environment (browser, Docker vs bare-metal, backend version).

## References

- **Architecture:** `docs/architecture/README.md`
- **Configuration:** `docs/Configuration.md`
- **Design system & theming:** `design.md`
- **Module structure:** `docs/module-boundaries.md`
- **Known findings register:** `docs/finding-register.md`
