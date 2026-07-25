# SDD #477: Manager Configurable Participant Cap

## 1. Overview
Allows managers to configure a custom maximum player limit (e.g. 30, 50, 100) per game session, bounded by server hard cap (200).

## 2. Architecture & Data Structures
- **Config Setting**: `maxParticipants: number` (min 2, max 200)

## 3. UI/UX Contract
- **Manager Settings**: Number input / slider control under Game Settings.
- **Join Logic**: Server rejects `player:join` emits exceeding `maxParticipants` with `GAME_FULL` status.

## 4. Verification Gate
- Vitest suite: `participantCap.test.ts` (6 tests).
