# SDD #474: Q&A Live Moderation Panel

## 1. Overview
Provides a dedicated side panel during live games for players to ask questions, upvote peer questions, and hosts to moderate/answer them.

## 2. Architecture & Data Structures
- **Question Item**: `{ id: string; authorName: string; text: string; upvotes: number; answered: boolean }`

## 3. UI/UX Contract
- **Manager Console**: Collapsible Q&A drawer with approve, answer, and delete actions.
- **Player Interface**: Floating Q&A button opening question submission & upvote dialog.

## 4. Socket Protocol
- `player:submitQAQuestion`, `player:upvoteQAQuestion`, `manager:moderateQAQuestion`.

## 5. Verification Gate
- Vitest suite: `QAPanel.test.tsx` (6 tests).
