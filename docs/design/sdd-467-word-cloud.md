# SDD #467: Word Cloud Fragetyp

## 1. Overview
Word Cloud is an un-scored or open-ended question type where player text responses are aggregated and visualized live as a dynamic word cloud.

## 2. Architecture & Data Structures
- **Question Type**: `"word-cloud"`
- **Options Payload**: `maxWordsPerPlayer: number` (1-3), `maxLength: number` (20 chars)
- **Submission Payload**: `words: string[]`

## 3. UI/UX Contract
- **Player Interface**: Clean input fields for submitting short text words.
- **Display Stage**: Real-time canvas/SVG word cloud layout algorithm (d3-cloud / custom layout engine) scaling word sizes based on frequency.
- **Design Tokens**: Palette uses `getThemeTokenCssVar()` for dynamic color mapping.

## 4. Socket Protocol
- Server broadcast: `game:wordCloudUpdate` with `{ wordFrequencies: Record<string, number> }`.
- Host moderation: Ability to hide inappropriate words via `manager:wordCloudCensor`.

## 5. Verification Gate
- Vitest suite: `WordCloudDisplay.test.tsx` (6 tests).
- Token compliance: `pnpm tokens:validate` clean.
