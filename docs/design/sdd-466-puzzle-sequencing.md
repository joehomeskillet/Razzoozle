# SDD #466: Puzzle / Sequencing Fragetyp

## 1. Overview
The Puzzle / Sequencing question type requires players to arrange a set of items into the correct order (chronological, numerical, or logical).

## 2. Architecture & Data Structures
- **Question Type**: `"puzzle"`
- **Options Payload**: `items: Array<{ id: string; label: string; correctOrder: number }>`
- **Submission Payload**: `itemOrder: string[]` (array of item IDs in submitted sequence)

## 3. UI/UX Contract
- **Player Interface**: Vertical/grid touch-draggable tile list with drag handles and accessibility ARIA move controls (Up/Down buttons for screen readers).
- **Display Stage**: Shows item sequence blocks locking in live as players submit.
- **Design Tokens**: Reuses mapped answer tile tokens (`bg-answer-1`, `bg-answer-2`, etc.). Touch targets min 44px height.

## 4. Socket Protocol
- Client emit: `player:submitAnswer` with payload `{ questionId, answer: { itemOrder: string[] } }`.
- Server scoring: Compares `submittedOrder` against `correctOrder`. Full points for exact match, partial credit mode option.

## 5. Verification Gate
- Vitest suite: `PuzzleSequencingInput.test.tsx` (6 tests).
- Token compliance: `pnpm tokens:validate` clean.
