# Repository Metadata

**Captured:** 2026-07-29  
**Source:** Live `git` operations and filesystem measurement

## Repository Statistics

### Git Database

```
Commits:                50
Loose objects:          3,866
Packed objects:         105,470
Pack files:             13
Garbage objects:        0
```

### Size Breakdown

| Component | Size | Notes |
|-----------|------|-------|
| `.git` database | 654 MB | See note below |
| Tracked files | 12 MB | `git ls-files` content |
| Working directory (total) | 76 GB | Includes node_modules, build artifacts, etc. |

### Authorship

| Field | Value |
|-------|-------|
| Current committer name | Claude Code |
| Current committer email | noreply@anthropic.com |

## Historical Note: Garbage Collection

The `.git` database is 654 MB in size, which is significantly larger than the ~12 MB of tracked content would suggest. This is due to a past incident where a misconfigured automation committed approximately **24,496 cache files** into the repository. Although the offending commit has since been removed, the objects remain in the Git object database until the next garbage collection (`git gc`) runs.

For accurate database size in the future, run:
```bash
git gc --aggressive
du -sh .git
```

This will repack and reclaim the space from the orphaned objects.

## Development History

Recent activity shows active development across multiple areas:

- **Latest commit** (`a7cb6204c`): Hotfix for Docker HEALTHCHECK configuration
- **Recent focus**: E2E testing suite expansion, database schema audits, word-cloud aggregation, document governance
- **Architecture**: Rust server (`rust/server`) + Node.js web client (`packages/web`) + MCP integration (`packages/mcp`)

## Key Directories

| Path | Purpose |
|------|---------|
| `rust/server/src/` | Axum HTTP server (~51 routes) |
| `packages/web/` | React web client |
| `packages/common/` | Shared types, validators, MCP server |
| `db/migrations/` | SQL migration scripts |
| `docs/adr/` | Architecture Decision Records |
| `docs/sdd/` | System Design Documents |
| `source/e2e/` | End-to-end tests |

## Relevant Documentation

- **Architecture**: `AGENTS.md` (project map, worker rules)
- **API strategy**: `docs/adr/007-http-api-documentation-strategy.md`
- **Operations**: `docs/operations/` (environment config, database procedures, deployment)
- **Development**: `CLAUDE.md` (command reference, UI governance rules)

## Configuration

The repository uses:
- **Package management**: pnpm (monorepo)
- **Build system**: Vite + Rust cargo
- **Testing**: Vitest (TS), pytest (Python fixtures), e2e via Stagehand/Playwright
- **Linting**: ESLint, Prettier, rustfmt
- **CI/CD**: Docker-based (see Dockerfile in root)

Note: Configuration files (database credentials, environment variables) are located in `/nvmetank1/projects/Razzoozle/config/` outside the repository root and are not committed.
