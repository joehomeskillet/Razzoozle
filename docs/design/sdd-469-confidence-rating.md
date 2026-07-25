# SDD #469: Confidence Rating Fragetyp

## 1. Overview
Pairs standard answer selection (Choice / True-False) with a self-assessed confidence level (e.g. 100% Sure, 50% Guessing, Unsure).

## 2. Architecture & Data Structures
- **Question Type**: Any standard question type + `confidenceEnabled: true`
- **Submission Payload**: `{ answer: unknown; confidence: 'high' | 'medium' | 'low' }`

## 3. UI/UX Contract
- **Player Interface**: 2-step prompt or integrated confidence pill selector below answer tiles.
- **Display Stage**: Post-reveal breakdown chart showing accuracy vs. confidence matrix (e.g., "High Confidence & Correct" vs "Confidently Incorrect").

## 4. Socket Protocol
- Included in standard `player:submitAnswer` payload.
- Server scoring optional multiplier or separate confidence analytics tracking.

## 5. Verification Gate
- Vitest suite: `ConfidenceSelector.test.tsx` (6 tests).
- Token compliance: `pnpm tokens:validate` clean.
