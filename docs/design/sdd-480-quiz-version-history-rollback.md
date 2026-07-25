# SDD #480: Quiz Version History & Rollback

## 1. Overview
Maintains an immutable revision history for each quiz, allowing managers to inspect previous edits and restore earlier versions.

## 2. Architecture & Data Structures
- **Revision Record**: `{ revisionId: number; quizId: string; version: number; createdAt: string; author: string; snapshot: Quizz }`

## 3. UI/UX Contract
- **Quiz Editor**: "Version History" drawer displaying timestamped revisions, diff previews, and "Restore Version" action.

## 4. Verification Gate
- Vitest suite: `QuizVersionHistory.test.tsx` (6 tests).
