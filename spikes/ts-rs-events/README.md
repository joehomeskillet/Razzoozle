# ts-rs-events Spike

## Overview

This spike tests the viability of "Rust leads, ts-rs generates, common consumes" as a single-source-of-truth approach for the Razzoozle event type system (Phase 1 gate).

## Quick Start

```bash
cd spikes/ts-rs-events
cargo build
cargo test
cargo run --bin export_types
```

The `export_types` binary generates `generated_types.ts` containing the TypeScript type definitions.

## Files

- `Cargo.toml` — Rust package manifest (serde, ts-rs dependencies)
- `src/lib.rs` — Rust struct definitions for SELECT_ANSWER payload + related types
  - `QuestionMediaType` enum (image, video, audio)
  - `QuestionMedia` struct (media metadata)
  - `SelectAnswerPayload` struct (the main payload being tested)
- `src/bin/export_types.rs` — Code-generation binary that outputs TypeScript
- `generated_types.ts` — Auto-generated TypeScript type file (output of export_types)
- `.gitignore` — Excludes Rust build artifacts and generated files

## What This Tests

1. **Struct Definition**: Can we accurately define Razzoozle event payloads in Rust?
2. **Serialization**: Do serde + ts-rs correctly handle snake_case → camelCase conversion?
3. **Type Generation**: Does ts-rs produce valid TypeScript that matches the original hand-written types?
4. **Optional Fields**: How does Rust's `Option<T>` map to TS's optional syntax?
5. **Enums**: Do Rust enums with serde attributes match string-literal unions?

## Test Results

Three tests in `src/lib.rs`:

1. ✅ `test_select_answer_minimal` — Minimal payload (required + some optional fields)
2. ✅ `test_select_answer_full` — Full payload with all fields populated
3. ✅ `test_select_answer_sentence_builder` — Sentence-builder variant with shuffledChunks

All tests pass and demonstrate correct JSON serialization.

## Key Findings

### Mismatches Between Generated and Hand-Written TS

| Issue | Severity | Details |
|-------|----------|---------|
| **Optionality** | 🔴 BLOCKING | TS uses `field?: Type`, ts-rs generates `field: Type \| null`. Different runtime semantics. |
| **Numeric Types** | 🟡 MINOR | TS uses `number`, ts-rs generates `bigint` for i64 fields. Wire-compatible but type-incompatible. |
| **String Enums** | 🟢 GOOD | ts-rs correctly generates discriminated unions from Rust enums. |
| **camelCase** | 🟢 GOOD | serde rename attributes are honored. |

### Unsupported TS Patterns

The broader Razzoozle type system includes patterns ts-rs **cannot** express:

- ❌ **Mapped types** (`Record<Status, Payload>`, discriminated unions by key)
- ❌ **Conditional types** (type-level branching)
- ❌ **Intersection types** (`Type1 & Type2`)
- ❌ **Zod inference** (`z.infer<typeof validator>`)

These appear in:
- `status.ts` — `StatusDataMap` (mapped union of payloads)
- `index.ts` — `Question`, `Quizz` (Zod-derived types)
- `socket.ts` — Intersection patterns, complex payload unions

## Verdict

**NOT VIABLE for Phase 1 without significant refactoring.**

The "Rust leads, ts-rs generates, common consumes" model assumes 1:1 type compatibility. The Razzoozle type system is too complex (mapped unions, Zod validators, intersection types) to express purely in Rust without redesigning the API.

### Recommendation: Hybrid Approach

1. Use Rust for **new simple payloads** (e.g., low-latency mode events, new SELECT_ANSWER variants).
2. Keep TS for **complex types** (StatusDataMap, Question, ManagerConfig).
3. Implement a **CI validator** that checks hand-written TS types against Rust-generated ones for specific payloads.
4. ts-rs becomes a **verification tool**, not the single source.

This trades "one source of truth" for "verified dual maintenance," reducing sync bugs with minimal refactoring.

## Next Steps

1. **Phase 1 Gate**: Use this spike's findings to decide between:
   - Option A: Selective adoption (new payloads in Rust, keep complex ones in TS)
   - Option B: Full redesign (refactor TS to avoid ts-rs limitations)
   - Option C: Hybrid bridge (CI-validated dual maintenance)

2. **If proceeding with Rust**: Address optional field semantics with a consistent pattern:
   - Mandate `skip_serializing_if = "Option::is_none"` everywhere.
   - Clients must never send explicit `null` for optional fields.
   - Document the encoding in a wire-protocol spec.

3. **Broader Scan**: Inventory all types in `packages/common/src/types/game/*.ts` and classify by ts-rs compatibility.

