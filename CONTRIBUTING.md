# Contributing to Razzoozle

Thanks for your interest. Razzoozle is a fork of [Ralex91/Razzia](https://github.com/Ralex91/Razzia), released under the MIT License.

## Development

```bash
pnpm install
pnpm dev        # web + socket with hot reload
```

It's a pnpm monorepo: `@razzoozle/web` (React + Vite + Tailwind v4), `@razzoozle/socket` (Node + Socket.IO), `@razzoozle/common` (shared Zod types), `@razzoozle/mcp` (MCP server).

## Before opening a PR

Run the full gate and keep it green:

```bash
pnpm verify     # typecheck + oxlint + tests
```

- Match the surrounding code style (the repo uses Prettier + oxlint).
- Add or update tests for behaviour changes (the socket package is well covered).
- Keep user-facing strings translated across all six locales (`packages/web/src/locales/*`).
- For UI work, respect the theming system — never hard-code colours; use the theme CSS variables.

## Reporting issues

Use the issue templates. Include steps to reproduce, expected vs actual behaviour, and your environment (browser, Docker vs bare-metal).
