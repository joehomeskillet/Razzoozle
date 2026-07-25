# SDD #476: Seeded Question Order Randomization

## 1. Overview
Ensures question order shuffling is deterministic using a session seed, allowing reconnecting players and display sync to stay consistent.

## 2. Architecture & Data Structures
- **Game State**: `questionSeed: number`
- **Shuffle Utility**: Seeded PRNG (e.g. Mulberry32) shuffling question array deterministically.

## 3. Implementation Details
- Integrated into `packages/socket/src/services/game/round-manager/` and Rust engine `rust/engine/src/game.rs`.

## 4. Verification Gate
- Vitest suite: `seededShuffle.test.ts` (6 tests).
