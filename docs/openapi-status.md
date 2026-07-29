# OpenAPI Status

**Decision:** Not Implemented (ADR-007)  
**Status:** Accepted  
**Last Updated:** 2026-07-29

## Summary

The HTTP API of Razzoozle is **not documented via OpenAPI**. This is an explicit architectural decision (ADR-007) made because:

1. **No external consumers exist** — the HTTP interface is consumed exclusively by the internal web client (`packages/web`), which already has direct TypeScript type imports.
2. **Dead code exists** — `packages/common/src/openapi/doc.ts` contains a `buildOpenApiDoc()` generator that is never called, and there is no Rust handler at `/api/openapi.json` to serve it.
3. **Validator drift** — stale validators like `soloScoreSubmitValidator` and `assignmentValidator` in `packages/common/src/validators/` exist only to feed the OpenAPI spec but are never actually used for parsing or validation.

## Decision (ADR-007)

**HTTP contracts are documented via three mechanisms:**

1. **Code comments** — HTTP handlers in `rust/server/src/http/` carry descriptive comments about purpose, authentication, and error handling.
2. **Integration tests** — `packages/web/src/**/*.test.ts` and `source/e2e/` validate request/response contracts through live calls.
3. **MCP interface** — The MCP server (`packages/mcp`) documents domain-specific types via Zod schemas and serves as the machine-readable interface for external tools (e.g., CLI, browser extensions).

If external HTTP consumers emerge in the future, OpenAPI support will be introduced via Rust libraries (utoipa, aide) at that time, not through the dead TypeScript pipeline.

## Consequences

### What does NOT exist

- No `/api/openapi.json` endpoint
- No active OpenAPI 3.1.0 JSON schema generation
- No Rust-side OpenAPI decorators (utoipa, aide)

### What remains as documentation

- **Web client**: Direct TypeScript imports (implicit contract)
- **Tests**: Live HTTP calls in `source/e2e/` and `packages/web/src/**/*.test.ts` (explicit contract)
- **MCP server**: Zod schemas in `packages/mcp/src/` (external tool integration)
- **Code comments**: Handler documentation in `rust/server/src/http/mod.rs`

### Dead code to clean up

Per ADR-007, the following should be removed:

1. `packages/common/src/openapi/doc.ts` — the dead generator
2. Validator imports that only serve OpenAPI:
   - `soloScoreSubmitValidator` (if only referenced in `openapi/doc.ts`)
   - `assignmentValidator` (if only referenced in `openapi/doc.ts`)
3. Documentation references claiming "OpenAPI is served" or "OpenAPI could be activated" (see ADR-007 §3 for specific files)

## References

- **ADR-007**: `docs/adr/007-http-api-documentation-strategy.md`
- **Dead generator**: `packages/common/src/openapi/doc.ts`
- **Comment on unimplemented endpoint**: `packages/web/src/features/manager/components/configurations/ConfigDev/useDevTelemetry.ts:37` (documents that `/api/openapi.json` was never implemented)
- **Stale validators**: `packages/common/src/validators/solo.ts`, `packages/common/src/validators/assignment.ts`
- **Documentation to correct**: 
  - `docs/sdd/game-solo-multiplayer-refactor/phase0-gaps-and-duplication.md` (G17)
  - `docs/rezept-neuer-fragetyp.md` (line 142–143)
  - `docs/sdd/game-solo-multiplayer-refactor/08-api-and-data-contracts.md` (lines 74–77, 148–150, 167)

## Developer Guidance

When documenting HTTP changes:
- **Do not add OpenAPI routes or specs**.
- Document the change in the handler's code comments (purpose, auth, error codes).
- Add integration tests to `source/e2e/` or `packages/web/src/**/*.test.ts`.
- If building tools to integrate with Razzoozle, use the MCP server (`packages/mcp`) for type definitions, not OpenAPI.
