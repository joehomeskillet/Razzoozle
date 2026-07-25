# SDD #471: Self-Paced / Assignments Play Mode

## 1. Overview
Asynchronous quiz mode where students complete quizzes individually before a configured deadline without requiring a live host.

## 2. Architecture & Data Structures
- **Game Mode**: `"assignment"`
- **Assignment Record**: `{ id: string; quizId: string; deadline: string; pin: string; completionCount: number }`

## 3. UI/UX Contract
- **Manager Console**: Assignment creation modal with deadline picker, shareable link/PIN generation, and submission dashboard.
- **Player Interface**: Self-paced round manager running locally with progress auto-save to LocalStorage.

## 4. Socket / REST API
- REST endpoints: `POST /api/assignments`, `GET /api/assignments/:id/results`.
- Optional socket connection for real-time manager dashboard updates when a student submits.

## 5. Verification Gate
- Vitest suite: `AssignmentRunner.test.tsx` (6 tests).
- Typecheck clean.
