# SDD #468: Brainstorming Fragetyp

## 1. Overview
Brainstorming allows players to submit ideas, group them into categories, and upvote top ideas in real-time.

## 2. Architecture & Data Structures
- **Question Type**: `"brainstorm"`
- **Submission Payload**: `idea: { id: string; text: string; categoryId?: string }`
- **Upvote Payload**: `ideaId: string`

## 3. UI/UX Contract
- **Player Interface**: Two-phase UI: Phase 1 Idea Submission, Phase 2 Upvoting / Prioritization (3 votes per player).
- **Display Stage**: Kanban/Sticky-note board layout grouping ideas with live upvote counters and animated top rankers.

## 4. Socket Protocol
- Client emit: `player:submitIdea`, `player:upvoteIdea`.
- Server broadcast: `game:brainstormUpdate` with aggregated ideas and votes.

## 5. Verification Gate
- Vitest suite: `BrainstormStage.test.tsx` (6 tests).
- Token compliance: `pnpm tokens:validate` clean.
