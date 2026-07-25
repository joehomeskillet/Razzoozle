# SDD #473: Challenge Mode

## 1. Overview
Asynchronous 1-vs-1 or group challenge mode where a player completes a quiz and sends a challenge link to friends to beat their score.

## 2. Architecture & Data Structures
- **Challenge Record**: `{ challengeId: string; creatorName: string; creatorScore: number; quizId: string; responses: Record<string, number> }`

## 3. UI/UX Contract
- Challenge completion screen with "Challenge a Friend" share modal (Web Share API + QR Code).
- Recipient view displaying challenger's avatar, score target, and replay attempt.

## 4. REST API
- `POST /api/challenges`, `GET /api/challenges/:id`.

## 5. Verification Gate
- Vitest suite: `ChallengeFlow.test.tsx` (6 tests).
