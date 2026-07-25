# SDD #472: Ghost / Replay Mode

## 1. Overview
Allows solo players to replay a previously hosted game session against "ghosts" (recorded player timing and answer data from earlier sessions).

## 2. Architecture & Data Structures
- **Game Mode**: `"ghost"`
- **Ghost Data**: `Array<{ username: string; answers: Array<{ questionIndex: number; answer: unknown; timeMs: number }> }>`

## 3. UI/UX Contract
- **Player Interface**: Standard solo player interface with live leaderboard rendering ghost avatars and scores alongside the player.

## 4. Implementation Details
- Client-side playback engine interpolating ghost progress timestamps during the round timer.

## 5. Verification Gate
- Vitest suite: `GhostPlaybackEngine.test.ts` (6 tests).
- Token compliance clean.
